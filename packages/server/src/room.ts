import { Room, Client } from "colyseus";
import { WorldState, Player, Mob, DroppedItem, Projectile } from "./state.js";
import { 
  TICK_RATE, MAP, type ChatMessage, NPC_MERCHANT, SHOP_ITEMS,
  FounderTier, FOUNDER_REWARDS, REFERRAL_REWARDS, ANNIVERSARY_REWARDS,
  EARLY_BIRD_LIMIT, BETA_TEST_PERIOD_DAYS, BUG_HUNTER_REPORTS_REQUIRED,
  calculateLevelFromXp, getBaseStatsForLevel, DEFAULT_ITEMS, MOB_TEMPLATES, 
  LOOT_TABLES, MobType, AIState, DamageType, ZONES, ZoneType, CRAFTING_RECIPES
} from "@toodee/shared";
import { generateMichiganish, isWalkable, type Grid } from "./map.js";

type Input = { seq: number; up: boolean; down: boolean; left: boolean; right: boolean; attack?: boolean; rangedAttack?: boolean };

export class GameRoom extends Room<WorldState> {
  private inputs = new Map<string, Input>();
  private grid!: Grid;
  private speed = 4; // tiles per second (server units are tiles)
  private lastAttack = new Map<string, number>();
  private attackCooldown = 400; // ms

  // Founder tracking
  private joinCounter = 0;
  private founderTracker = new Map<string, { joinOrder: number; tier: FounderTier }>();
  private currentZone = "town"; // Default zone for this room
  private maxPlayersBeforeOverflow = 40;
  
  // Performance monitoring
  private tickTimes: number[] = [];
  private lastPerformanceLog = 0;
  private maxTickTime = 0;

  // Constants
  private static readonly SPAWN_DUMMY_PROBABILITY = 0.3;

  onCreate(options: any) {
    this.setPatchRate(1000 / 10); // send state ~10/s; interpolate on client
    this.setState(new WorldState());
    
    // Configure room for specific zone
    this.currentZone = options?.zone || "town";
    const zone = ZONES[this.currentZone];
    
    if (zone) {
      this.state.width = zone.width;
      this.state.height = zone.height;
      this.maxPlayersBeforeOverflow = zone.maxPlayers;
    } else {
      this.state.width = MAP.width;
      this.state.height = MAP.height;
    }

    this.grid = generateMichiganish();

    this.onMessage("input", (client, data: Input) => {
      this.inputs.set(client.sessionId, data);
    });
    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const clean = sanitizeChat(text);
      if (!clean) return;
      const msg: ChatMessage = { from: p.name || "Adventurer", text: clean, ts: Date.now() };
      this.broadcast("chat", msg);
    });
    this.onMessage("attack", (client) => this.handleAttack(client.sessionId));
    this.onMessage("ranged_attack", (client) => this.handleRangedAttack(client.sessionId));
    this.onMessage("zone_transition", (client, data: { targetZone: string }) => this.handleZoneTransition(client.sessionId, data.targetZone));
    this.onMessage("craft", (client, data: { recipeId: string }) => this.handleCrafting(client.sessionId, data.recipeId));
    this.onMessage("shop:list", (client) => this.handleShopList(client.sessionId));
    this.onMessage("shop:buy", (client, data: { id: string; qty?: number }) => this.handleShopBuy(client.sessionId, data));
    this.onMessage("bug_report", (client, data: { description: string }) => this.handleBugReport(client.sessionId, data));
    this.onMessage("referral", (client, data: { referredPlayerId: string }) => this.handleReferral(client.sessionId, data));

    this.setSimulationInterval((dtMS) => this.update(dtMS / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client, options: any) {
    // Check if room is at capacity
    if (this.state.players.size >= this.maxPlayersBeforeOverflow) {
      client.error(1000, "Room full - creating overflow instance");
      client.leave();
      return;
    }
    
    const p = new Player();
    p.id = client.sessionId;
    p.name = options?.name || "Adventurer";
    
    // Initialize progression system
    p.level = 1;
    p.totalXp = 0;
    p.currentXp = 0;
    p.xpToNext = 100;
    
    // Calculate base stats for level 1
    const baseStats = getBaseStatsForLevel(1);
    p.attack = baseStats.attack;
    p.defense = baseStats.defense;
    p.magicAttack = baseStats.magicAttack;
    p.magicDefense = baseStats.magicDefense;
    p.accuracy = baseStats.accuracy;
    p.evasion = baseStats.evasion;
    
    p.maxHp = 50 + (p.level - 1) * 10; // Base HP scaling
    p.hp = p.maxHp;
    p.gold = 50;
    p.pots = 2;
    
    // Initialize equipment and inventory
    p.weaponId = "";
    p.armorId = "";
    p.accessoryId = "";
    p.inventory.set("health_potion", 3);
    p.inventory.set("wooden_sword", 1);
    
    // Initialize zone
    p.currentZone = this.currentZone;
    
    // Spawn at zone spawn point or center
    const zone = ZONES[this.currentZone];
    if (zone) {
      p.x = zone.spawnPoint.x;
      p.y = zone.spawnPoint.y;
    } else {
      p.x = Math.floor(MAP.width * 0.45);
      p.y = Math.floor(MAP.height * 0.55);
    }
    
    // Initialize founder rewards tracking
    p.joinTimestamp = Date.now();
    p.bugReports = 0;
    p.referralsCount = 0;
    p.anniversaryParticipated = false;
    p.displayTitle = "";
    p.chatColor = "#FFFFFF";
    
    // Determine founder tier
    this.joinCounter++;
    const founderTier = this.determineFounderTier(this.joinCounter, p.joinTimestamp);
    p.founderTier = founderTier;
    this.founderTracker.set(client.sessionId, { joinOrder: this.joinCounter, tier: founderTier });
    
    // Grant initial founder rewards
    this.grantFounderRewards(p, founderTier);
    
    // spawn near center (or restore from client-provided snapshot for demo persistence)
    const rx = options?.restore?.x, ry = options?.restore?.y;
    if (typeof rx === "number" && typeof ry === "number") {
      const tx = clamp(Math.round(rx), 0, this.state.width - 1);
      const ty = clamp(Math.round(ry), 0, this.state.height - 1);
      p.x = tx;
      p.y = ty;
    }
    
    // Restore progression if provided
    if (options?.restore) {
      if (typeof options.restore.gold === "number") p.gold = Math.max(0, Math.min(999999, Math.floor(options.restore.gold)));
      if (typeof options.restore.pots === "number") p.pots = Math.max(0, Math.min(999, Math.floor(options.restore.pots)));
      if (typeof options.restore.totalXp === "number") {
        this.setPlayerXp(p, options.restore.totalXp);
      }
    }
    
    this.state.players.set(client.sessionId, p);
    
    // Spawn some basic mobs for testing
    this.initializeMobs();
  }
    update(dt: number) {
    const tickStart = performance.now();
    
    // per-player movement
    this.state.players.forEach((p, id) => {
      const inp = this.inputs.get(id);
      if (!inp) return;
      
      const vel = { x: 0, y: 0 };
      if (inp.up) vel.y -= 1;
      if (inp.down) vel.y += 1;
      if (inp.left) vel.x -= 1;
      if (inp.right) vel.x += 1;
      
      // normalize diagonal movement
      if (vel.x !== 0 || vel.y !== 0) {
        const mag = Math.hypot(vel.x, vel.y);
        vel.x /= mag;
        vel.y /= mag;
      }
      
      const oldX = p.x;
      const oldY = p.y;
      
      // Calculate new position
      const nx = p.x + vel.x * this.speed * dt;
      const ny = p.y + vel.y * this.speed * dt;

      // Enhanced collision detection
      const tx = Math.round(nx);
      const ty = Math.round(ny);
      
      // Check if new position is walkable
      let canMoveX = true;
      let canMoveY = true;
      
      // Check X movement
      if (!isWalkable(this.grid, Math.round(nx), Math.round(p.y))) {
        canMoveX = false;
      }
      
      // Check Y movement  
      if (!isWalkable(this.grid, Math.round(p.x), Math.round(ny))) {
        canMoveY = false;
      }
      
      // Check diagonal movement
      if (!isWalkable(this.grid, Math.round(nx), Math.round(ny))) {
        canMoveX = false;
        canMoveY = false;
      }
      
      // Apply movement based on collision results
      if (canMoveX) {
        p.x = nx;
      }
      if (canMoveY) {
        p.y = ny;
      }
      
      // Only update direction if actually moving or trying to move
      if (vel.x !== 0 || vel.y !== 0) {
        if (vel.y < 0) p.dir = 0; // up
        else if (vel.x > 0) p.dir = 1; // right
        else if (vel.y > 0) p.dir = 2; // down
        else if (vel.x < 0) p.dir = 3; // left
      }

      p.lastSeq = inp.seq >>> 0;
    });
    
    // Update projectiles
    this.updateProjectiles(dt);
    
    // Update mob AI
    this.updateMobAI(dt);
    
    // Performance monitoring
    const tickEnd = performance.now();
    const tickTime = tickEnd - tickStart;
    this.tickTimes.push(tickTime);
    this.maxTickTime = Math.max(this.maxTickTime, tickTime);
    
    // Keep only last 100 measurements
    if (this.tickTimes.length > 100) {
      this.tickTimes.shift();
    }
    
    // Log performance every 30 seconds
    const now = Date.now();
    if (now - this.lastPerformanceLog > 30000) {
      this.logPerformanceStats();
      this.lastPerformanceLog = now;
    }
  }

  private handleAttack(playerId: string) {
    const now = Date.now();
    const last = this.lastAttack.get(playerId) || 0;
    if (now - last < this.attackCooldown) return;
    this.lastAttack.set(playerId, now);

    const attacker = this.state.players.get(playerId);
    if (!attacker || attacker.hp <= 0) return;

    // Hit check: 1-tile arc in front, mobs first then players
    const front = neighbor(attacker.x, attacker.y, attacker.dir);
    
    // Attack mobs first
    let hitSomething = false;
    this.state.mobs.forEach((mob, key) => {
      const mx = Math.round(mob.x), my = Math.round(mob.y);
      if (mx === front.x && my === front.y && mob.hp > 0 && !hitSomething) {
        // Calculate damage based on attacker stats and mob defense
        const template = MOB_TEMPLATES[mob.type as MobType];
        if (!template) return;
        
        const levelMultiplier = 1 + (mob.level - 1) * 0.2;
        const mobDefense = Math.floor(template.baseStats.defense * levelMultiplier);
        
        // Simple damage calculation: attack - defense, minimum 1
        const rawDamage = attacker.attack - mobDefense;
        const finalDamage = Math.max(1, Math.floor(rawDamage * (0.8 + Math.random() * 0.4))); // 20% variance
        
        mob.hp = Math.max(0, mob.hp - finalDamage);
        hitSomething = true;
        
        // Broadcast damage
        this.broadcast("damage", {
          targetId: mob.id,
          damage: finalDamage,
          targetType: "mob"
        });
        
        if (mob.hp === 0) {
          // Grant XP and potentially loot
          this.grantXp(attacker, template.xpReward);
          this.dropLoot(mob.x, mob.y, template.lootTableId, attacker.id);
          
          // Broadcast mob death
          this.broadcast("mob_death", {
            mobId: mob.id,
            killerName: attacker.name
          });
          
          const mobId = key;
          setTimeout(() => this.respawnMob(mobId), 15000); // 15 second respawn
        } else {
          // Set mob target to attacker for AI
          mob.targetPlayerId = attacker.id;
          mob.aiState = AIState.Chasing;
        }
      }
    });
    
    if (hitSomething) return;

    // Then attack other players (PvP)
    this.state.players.forEach((target, id) => {
      if (id === playerId || target.hp <= 0) return;
      const tx = Math.round(target.x);
      const ty = Math.round(target.y);
      if (tx === front.x && ty === front.y) {
        // Calculate PvP damage (reduced compared to PvE)
        const rawDamage = attacker.attack - target.defense;
        const finalDamage = Math.max(5, Math.floor(rawDamage * 0.3 * (0.8 + Math.random() * 0.4))); // Much lower for PvP
        
        target.hp = Math.max(0, target.hp - finalDamage);
        
        // Broadcast PvP damage
        this.broadcast("damage", {
          targetId: target.id,
          damage: finalDamage,
          targetType: "player",
          attackerName: attacker.name
        });
        
        if (target.hp === 0) {
          // Player death - respawn at town center after delay
          const targetId = id;
          setTimeout(() => {
            const t = this.state.players.get(targetId);
            if (!t) return;
            t.x = Math.floor(MAP.width * 0.45);
            t.y = Math.floor(MAP.height * 0.55);
            t.hp = t.maxHp;
            t.currentZone = "town"; // Force back to town
          }, 3000);
        }
      }
    });
  }

  private spawnMob(pos: { x: number; y: number }) {
    // Legacy method - now use spawnMobOfType with default slime
    this.spawnMobOfType(pos.x, pos.y, MobType.Slime);
  }

  private respawnMob(id: string) {
    const mob = this.state.mobs.get(id);
    if (!mob) return;
    
    // Respawn with full health at original patrol center
    mob.hp = mob.maxHp;
    mob.x = mob.patrolCenterX;
    mob.y = mob.patrolCenterY;
    mob.aiState = AIState.Patrol;
    mob.targetPlayerId = "";
  }

  private isNearMerchant(p: Player) {
    const dx = Math.abs(Math.round(p.x) - NPC_MERCHANT.x);
    const dy = Math.abs(Math.round(p.y) - NPC_MERCHANT.y);
    return Math.max(dx, dy) <= 2;
  }

  private handleShopList(playerId: string) {
    const p = this.state.players.get(playerId);
    if (!p) return;
    const payload = { items: SHOP_ITEMS, gold: p.gold, pots: p.pots, npc: NPC_MERCHANT };
    this.clients.find(c => c.sessionId === playerId)?.send("shop:list", payload);
  }

  private handleShopBuy(playerId: string, data: { id: string; qty?: number }) {
    const p = this.state.players.get(playerId);
    if (!p) return;
    if (!this.isNearMerchant(p)) {
      this.clients.find(c => c.sessionId === playerId)?.send("shop:result", { ok: false, reason: "Too far from merchant" });
      return;
    }
    const item = SHOP_ITEMS.find(i => i.id === data?.id);
    const qty = Math.max(1, Math.min(99, Number(data?.qty ?? 1) | 0));
    if (!item) {
      this.clients.find(c => c.sessionId === playerId)?.send("shop:result", { ok: false, reason: "Unknown item" });
      return;
    }
    const cost = item.price * qty;
    if (p.gold < cost) {
      this.clients.find(c => c.sessionId === playerId)?.send("shop:result", { ok: false, reason: "Not enough gold", gold: p.gold, pots: p.pots });
      return;
    }
    p.gold -= cost;
    if (item.id === "pot_small") p.pots = Math.min(999, p.pots + qty);
    this.clients.find(c => c.sessionId === playerId)?.send("shop:result", { ok: true, gold: p.gold, pots: p.pots });
    
    // Spawn a training dummy near town when someone buys potions
    if (Math.random() < GameRoom.SPAWN_DUMMY_PROBABILITY) { // 30% chance
      this.spawnMob({ x: Math.floor(MAP.width * 0.45) + 4, y: Math.floor(MAP.height * 0.55) });
    }
  }

  private logPerformanceStats() {
    if (this.tickTimes.length === 0) return;
    
    const sorted = [...this.tickTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index];
    const avg = sorted.reduce((sum, time) => sum + time, 0) / sorted.length;
    const playerCount = this.state.players.size;
    
    console.log(`[Performance] Room ${this.roomId}: ${playerCount} players, avg tick: ${avg.toFixed(2)}ms, p95 tick: ${p95.toFixed(2)}ms, max: ${this.maxTickTime.toFixed(2)}ms`);
    
    // Reset max for next period
    this.maxTickTime = 0;
    
    // Alert if p95 exceeds target
    if (p95 > 8) {
      console.warn(`⚠️  Performance warning: p95 tick time ${p95.toFixed(2)}ms exceeds 8ms target with ${playerCount} players`);
    }
  }

  private determineFounderTier(joinOrder: number, joinTimestamp: number): FounderTier {
    // Early Bird: First 50 players
    if (joinOrder <= EARLY_BIRD_LIMIT) {
      return FounderTier.EarlyBird;
    }
    
    // Beta Tester: Within first 2 weeks (simulated with current demo)
    const daysSinceLaunch = (Date.now() - joinTimestamp) / (1000 * 60 * 60 * 24);
    if (daysSinceLaunch <= BETA_TEST_PERIOD_DAYS) {
      return FounderTier.BetaTester;
    }
    
    return FounderTier.None;
  }

  private grantFounderRewards(player: Player, tier: FounderTier) {
    const rewards = FOUNDER_REWARDS[tier];
    for (const reward of rewards) {
      player.unlockedRewards.push(reward.id);
      
      // Apply specific reward effects
      switch (reward.type) {
        case "title":
          if (reward.id === "founder_badge") {
            player.displayTitle = "👑 Founder";
          } else if (reward.id === "bug_hunter_title") {
            player.displayTitle = "🐛 Bug Hunter";
          }
          break;
        case "cosmetic":
          if (reward.id === "special_chat_color") {
            player.chatColor = "#FFD700"; // Gold color for beta testers
          }
          break;
      }
    }
  }

  private handleBugReport(playerId: string, data: { description: string }) {
    const p = this.state.players.get(playerId);
    if (!p) return;
    
    // Basic validation
    if (!data.description || data.description.length < 10) {
      this.clients.find(c => c.sessionId === playerId)?.send("bug_report:result", { 
        ok: false, 
        reason: "Bug report must be at least 10 characters" 
      });
      return;
    }
    
    p.bugReports++;
    
    // Check if player qualifies for Bug Hunter tier
    if (p.bugReports >= BUG_HUNTER_REPORTS_REQUIRED && p.founderTier === FounderTier.None) {
      p.founderTier = FounderTier.BugHunter;
      this.grantFounderRewards(p, FounderTier.BugHunter);
    }
    
    this.clients.find(c => c.sessionId === playerId)?.send("bug_report:result", { 
      ok: true, 
      reportsCount: p.bugReports,
      message: p.bugReports >= BUG_HUNTER_REPORTS_REQUIRED ? "Bug Hunter tier unlocked!" : undefined
    });
  }

  private handleReferral(playerId: string, data: { referredPlayerId: string }) {
    const p = this.state.players.get(playerId);
    if (!p) return;
    
    // Basic validation - in a real system this would verify the referred player exists and is new
    if (!data.referredPlayerId) {
      this.clients.find(c => c.sessionId === playerId)?.send("referral:result", {
        ok: false,
        reason: "Invalid referral data"
      });
      return;
    }
    
    p.referralsCount++;
    
    // Check for referral rewards
    const referralReward = REFERRAL_REWARDS.find(r => r.referrals === p.referralsCount);
    if (referralReward) {
      p.unlockedRewards.push(referralReward.reward.id);
      
      this.clients.find(c => c.sessionId === playerId)?.send("referral:result", {
        ok: true,
        referralsCount: p.referralsCount,
        rewardUnlocked: referralReward.reward
      });
    } else {
      this.clients.find(c => c.sessionId === playerId)?.send("referral:result", {
        ok: true,
        referralsCount: p.referralsCount
      });
    }
  }

  private grantAnniversaryReward(playerId: string, rewardType: "login" | "quest" | "boss") {
    const p = this.state.players.get(playerId);
    if (!p) return;
    
    let reward;
    switch (rewardType) {
      case "login":
        reward = ANNIVERSARY_REWARDS.find(r => r.id === "birthday_badge");
        break;
      case "quest":
        reward = ANNIVERSARY_REWARDS.find(r => r.id === "birthday_quest_reward");
        break;
      case "boss":
        reward = ANNIVERSARY_REWARDS.find(r => r.id === "boss_slayer");
        break;
    }
    
    if (reward && !p.unlockedRewards.includes(reward.id)) {
      p.unlockedRewards.push(reward.id);
      p.anniversaryParticipated = true;
      
      this.clients.find(c => c.sessionId === playerId)?.send("anniversary:reward", {
        reward: reward,
        message: `Anniversary reward unlocked: ${reward.name}!`
      });
    }
  }

  // XP/Level System Methods
  private setPlayerXp(player: Player, totalXp: number) {
    player.totalXp = totalXp;
    const levelInfo = calculateLevelFromXp(totalXp);
    
    if (levelInfo.level > player.level) {
      // Level up!
      player.level = levelInfo.level;
      this.recalculatePlayerStats(player);
      
      // Broadcast level up message
      this.broadcast("level_up", {
        playerId: player.id,
        playerName: player.name,
        newLevel: player.level
      });
    }
    
    player.currentXp = levelInfo.currentXp;
    player.xpToNext = levelInfo.xpToNext;
  }
  
  private grantXp(player: Player, xpAmount: number) {
    this.setPlayerXp(player, player.totalXp + xpAmount);
  }
  
  private recalculatePlayerStats(player: Player) {
    const baseStats = getBaseStatsForLevel(player.level);
    
    // Apply base stats
    player.attack = baseStats.attack;
    player.defense = baseStats.defense;
    player.magicAttack = baseStats.magicAttack;
    player.magicDefense = baseStats.magicDefense;
    player.accuracy = baseStats.accuracy;
    player.evasion = baseStats.evasion;
    
    // Update HP (but keep current HP ratio)
    const oldMaxHp = player.maxHp;
    const hpRatio = player.hp / oldMaxHp;
    player.maxHp = 50 + (player.level - 1) * 10;
    
    // TODO: Apply equipment bonuses here when equipment system is fully implemented
    
    // Restore HP if leveling up
    if (player.maxHp > oldMaxHp) {
      player.hp = Math.max(player.hp, player.hp + (player.maxHp - oldMaxHp));
    }
  }
  
  private initializeMobs() {
    // Only spawn mobs if we don't have any
    if (this.state.mobs.size > 0) return;
    
    // Spawn mobs based on current zone
    const zone = ZONES[this.currentZone];
    if (zone) {
      zone.mobSpawns.forEach(spawn => {
        this.spawnMobOfType(spawn.x, spawn.y, spawn.mobType, spawn.level);
      });
    }
  }
  
  private spawnMobOfType(x: number, y: number, mobType: MobType, level: number = 1) {
    const template = MOB_TEMPLATES[mobType];
    if (!template) return;
    
    const mob = new Mob();
    mob.id = `${mobType}_${Math.random().toString(36).slice(2, 8)}`;
    mob.type = mobType;
    mob.name = template.name;
    mob.x = x;
    mob.y = y;
    mob.level = level;
    
    // Scale stats with level
    const levelMultiplier = 1 + (level - 1) * 0.2;
    mob.maxHp = Math.floor(template.baseHp * levelMultiplier);
    mob.hp = mob.maxHp;
    
    mob.aiState = AIState.Patrol;
    mob.targetPlayerId = "";
    mob.patrolCenterX = x;
    mob.patrolCenterY = y;
    
    this.state.mobs.set(mob.id, mob);
  }
  
  private dropLoot(x: number, y: number, lootTableId: string, killerPlayerId: string) {
    const lootTable = LOOT_TABLES[lootTableId];
    if (!lootTable) return;
    
    // Process each loot entry
    lootTable.entries.forEach(entry => {
      if (Math.random() <= entry.dropChance) {
        const drop = new DroppedItem();
        drop.id = `drop_${Math.random().toString(36).slice(2, 8)}`;
        drop.itemId = entry.itemId;
        drop.quantity = entry.quantity;
        drop.x = x + (Math.random() - 0.5) * 2; // Small random spread
        drop.y = y + (Math.random() - 0.5) * 2;
        drop.dropTime = Date.now();
        drop.droppedBy = killerPlayerId;
        
        this.state.droppedItems.set(drop.id, drop);
        
        // Auto-cleanup after 5 minutes
        setTimeout(() => {
          this.state.droppedItems.delete(drop.id);
        }, 300000);
      }
    });
  }

  private handleRangedAttack(playerId: string) {
    const now = Date.now();
    const last = this.lastAttack.get(playerId) || 0;
    if (now - last < this.attackCooldown * 1.5) return; // Longer cooldown for ranged
    this.lastAttack.set(playerId, now);

    const attacker = this.state.players.get(playerId);
    if (!attacker || attacker.hp <= 0) return;

    // Create projectile in direction player is facing
    const projectile = new Projectile();
    projectile.id = `proj_${Math.random().toString(36).slice(2, 8)}`;
    projectile.ownerId = playerId;
    projectile.x = attacker.x;
    projectile.y = attacker.y;
    
    // Set velocity based on direction
    const speed = 8; // tiles per second
    switch (attacker.dir) {
      case 0: // up
        projectile.vx = 0;
        projectile.vy = -speed;
        break;
      case 1: // right
        projectile.vx = speed;
        projectile.vy = 0;
        break;
      case 2: // down
        projectile.vx = 0;
        projectile.vy = speed;
        break;
      case 3: // left
        projectile.vx = -speed;
        projectile.vy = 0;
        break;
    }
    
    projectile.damage = Math.floor(attacker.magicAttack * 0.8); // Ranged uses magic attack
    projectile.damageType = DamageType.Magical;
    projectile.startTime = now;
    projectile.maxRange = 8; // tiles
    
    this.state.projectiles.set(projectile.id, projectile);
    
    // Broadcast ranged attack
    this.broadcast("ranged_attack", {
      playerId: attacker.id,
      playerName: attacker.name,
      direction: attacker.dir
    });
  }
  
  private updateProjectiles(dt: number) {
    const now = Date.now();
    const toRemove: string[] = [];
    
    this.state.projectiles.forEach((proj, id) => {
      // Move projectile
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      
      // Check if projectile has traveled max range or hit wall
      const owner = this.state.players.get(proj.ownerId);
      const startDist = Math.hypot(
        proj.x - (owner?.x || proj.x),
        proj.y - (owner?.y || proj.y)
      );
      
      if (startDist > proj.maxRange || !isWalkable(this.grid, Math.round(proj.x), Math.round(proj.y))) {
        toRemove.push(id);
        return;
      }
      
      // Check collision with mobs
      this.state.mobs.forEach((mob, mobId) => {
        if (Math.round(proj.x) === Math.round(mob.x) && Math.round(proj.y) === Math.round(mob.y)) {
          // Hit mob
          const template = MOB_TEMPLATES[mob.type as MobType];
          if (template) {
            const levelMultiplier = 1 + (mob.level - 1) * 0.2;
            const mobDefense = template.baseStats.magicDefense * levelMultiplier;
            const finalDamage = Math.max(1, proj.damage - mobDefense);
            
            mob.hp = Math.max(0, mob.hp - finalDamage);
            
            // Broadcast hit
            this.broadcast("projectile_hit", {
              projectileId: id,
              targetId: mobId,
              damage: finalDamage,
              targetType: "mob"
            });
            
            if (mob.hp <= 0) {
              const attacker = this.state.players.get(proj.ownerId);
              if (attacker) {
                this.grantXp(attacker, template.xpReward);
                this.dropLoot(mob.x, mob.y, template.lootTableId, attacker.id);
              }
              
              setTimeout(() => this.respawnMob(mobId), 15000);
            } else {
              mob.targetPlayerId = proj.ownerId;
              mob.aiState = AIState.Chasing;
            }
          }
          
          toRemove.push(id);
        }
      });
      
      // Check collision with players (PvP)
      this.state.players.forEach((player, playerId) => {
        if (playerId === proj.ownerId) return; // Don't hit self
        if (Math.round(proj.x) === Math.round(player.x) && Math.round(proj.y) === Math.round(player.y)) {
          const finalDamage = Math.max(3, Math.floor(proj.damage * 0.2)); // Reduced PvP damage
          player.hp = Math.max(0, player.hp - finalDamage);
          
          this.broadcast("projectile_hit", {
            projectileId: id,
            targetId: playerId,
            damage: finalDamage,
            targetType: "player"
          });
          
          if (player.hp <= 0) {
            setTimeout(() => {
              const p = this.state.players.get(playerId);
              if (p) {
                p.x = Math.floor(MAP.width * 0.45);
                p.y = Math.floor(MAP.height * 0.55);
                p.hp = p.maxHp;
                p.currentZone = "town";
              }
            }, 3000);
          }
          
          toRemove.push(id);
        }
      });
    });
    
    // Remove expired/hit projectiles
    toRemove.forEach(id => this.state.projectiles.delete(id));
  }

  private updateMobAI(dt: number) {
    const now = Date.now();
    
    this.state.mobs.forEach((mob, mobId) => {
      if (mob.hp <= 0) return; // Dead mobs don't act
      
      const template = MOB_TEMPLATES[mob.type as MobType];
      if (!template) return;
      
      // Check for nearby players
      let closestPlayer: Player | null = null;
      let closestDistance = Infinity;
      
      this.state.players.forEach((player: Player) => {
      
      // Only consider players within a bounding box around the mob (aggroRange + 2 tiles buffer)
      const aggroBuffer = 2;
      const range = (template.aggroRange || 5) + aggroBuffer;
      this.state.players.forEach((player: Player) => {
        if (player.hp <= 0) return;
        // Fast bounding box check before expensive distance calculation
        if (
          Math.abs(mob.x - player.x) > range ||
          Math.abs(mob.y - player.y) > range
        ) {
          return;
        }
        const distance = Math.hypot(mob.x - player.x, mob.y - player.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPlayer = player;
        }
      });
      
      // AI State Machine
      switch (mob.aiState) {
        case AIState.Patrol:
          // Random patrol around spawn point
          if (Math.random() < DEFAULT_PATROL_CHANGE_FREQUENCY) { // 2% chance per frame to change direction
            const angle = Math.random() * Math.PI * 2;
            const distance = 2 + Math.random() * 3; // 2-5 tiles from center
            const targetX = mob.patrolCenterX + Math.cos(angle) * distance;
            const targetY = mob.patrolCenterY + Math.sin(angle) * distance;
            
            // Move towards patrol target
            const dx = targetX - mob.x;
            const dy = targetY - mob.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
              mob.x += (dx / dist) * template.moveSpeed * dt * 0.5; // Slower patrol speed
              mob.y += (dy / dist) * template.moveSpeed * dt * 0.5;
              
              // Ensure we stay on walkable tiles
              if (!isWalkable(this.grid, Math.round(mob.x), Math.round(mob.y))) {
                mob.x -= (dx / dist) * template.moveSpeed * dt * 0.5;
                mob.y -= (dy / dist) * template.moveSpeed * dt * 0.5;
              }
            }
          }
          
          // Check for aggro
          if (closestPlayer && closestDistance <= template.aggroRange) {
            mob.aiState = AIState.Chasing;
            mob.targetPlayerId = (closestPlayer as Player).id;
          }
          break;
          
        case AIState.Chasing:
          const target = this.state.players.get(mob.targetPlayerId);
          if (!target || target.hp <= 0) {
            // Target lost, return to patrol
            mob.aiState = AIState.Patrol;
            mob.targetPlayerId = "";
            break;
          }
          
          const targetDistance = Math.hypot(mob.x - target.x, mob.y - target.y);
          
          // Check if we should flee (if mob has flee threshold)
          if (template.fleeThreshold > 0 && (mob.hp / mob.maxHp) < template.fleeThreshold) {
            mob.aiState = AIState.Fleeing;
            break;
          }
          
          // If in attack range, attack
          if (targetDistance <= template.attackRange) {
            mob.aiState = AIState.Attacking;
            break;
          }
          
          // Chase target
          if (targetDistance > template.aggroRange * 1.5) {
            // Lost target, return to patrol
            mob.aiState = AIState.Patrol;
            mob.targetPlayerId = "";
          } else {
            // Move towards target
            const dx = target.x - mob.x;
            const dy = target.y - mob.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
              const newX = mob.x + (dx / dist) * template.moveSpeed * dt;
              const newY = mob.y + (dy / dist) * template.moveSpeed * dt;
              
              // Check walkability
              if (isWalkable(this.grid, Math.round(newX), Math.round(newY))) {
                mob.x = newX;
                mob.y = newY;
              }
            }
          }
          break;
          
        case AIState.Attacking:
          const attackTarget = this.state.players.get(mob.targetPlayerId);
          if (!attackTarget || attackTarget.hp <= 0) {
            mob.aiState = AIState.Patrol;
            mob.targetPlayerId = "";
            break;
          }
          
          const attackDistance = Math.hypot(mob.x - attackTarget.x, mob.y - attackTarget.y);
          if (attackDistance > template.attackRange) {
            mob.aiState = AIState.Chasing;
            break;
          }
          
          // Perform attack (simple damage over time)
          const mobAttackDamage = Math.floor(template.baseStats.attack * getLevelMultiplier(mob.level));
          const finalDamage = Math.max(1, mobAttackDamage - attackTarget.defense);
          
          attackTarget.hp = Math.max(0, attackTarget.hp - finalDamage);
          
          // Broadcast mob attack
          this.broadcast("mob_attack", {
            mobId: mobId,
            targetId: attackTarget.id,
            damage: finalDamage
          });
          
          // Return to chasing
          mob.aiState = AIState.Chasing;
          break;
          
        case AIState.Fleeing:
          const fleeFrom = this.state.players.get(mob.targetPlayerId);
          if (!fleeFrom) {
            mob.aiState = AIState.Patrol;
            mob.targetPlayerId = "";
            break;
          }
          
          // Move away from player
          const dx = mob.x - fleeFrom.x;
          const dy = mob.y - fleeFrom.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.1) {
            const fleeX = mob.x + (dx / dist) * template.moveSpeed * dt * 1.2; // Flee faster
            const fleeY = mob.y + (dy / dist) * template.moveSpeed * dt * 1.2;
            
            if (isWalkable(this.grid, Math.round(fleeX), Math.round(fleeY))) {
              mob.x = fleeX;
              mob.y = fleeY;
            }
          }
          
          // Stop fleeing if far enough or health recovered
          if (dist > template.aggroRange * 2 || (mob.hp / mob.maxHp) > template.fleeThreshold * 1.5) {
            mob.aiState = AIState.Patrol;
            mob.targetPlayerId = "";
          }
          break;
      }
    });
  }

  private handleZoneTransition(playerId: string, targetZoneId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    
    const currentZone = ZONES[player.currentZone];
    const targetZone = ZONES[targetZoneId];
    
    if (!currentZone || !targetZone) {
      console.error(`Invalid zone transition: ${player.currentZone} -> ${targetZoneId}`);
      return;
    }
    
    // Find the exit from current zone to target zone
    const exit = currentZone.exits.find(e => e.targetZone === targetZoneId);
    if (!exit) {
      this.clients.find(c => c.sessionId === playerId)?.send("zone_transition_failed", {
        reason: "No exit found to target zone"
      });
      return;
    }
    
    // Check if player is at the exit location
    const playerTileX = Math.round(player.x);
    const playerTileY = Math.round(player.y);
    
    if (Math.abs(playerTileX - exit.x) > 1 || Math.abs(playerTileY - exit.y) > 1) {
      this.clients.find(c => c.sessionId === playerId)?.send("zone_transition_failed", {
        reason: "Not at exit location"
      });
      return;
    }
    
    // Check level requirement
    if (exit.requiresLevel && player.level < exit.requiresLevel) {
      this.clients.find(c => c.sessionId === playerId)?.send("zone_transition_failed", {
        reason: `Requires level ${exit.requiresLevel}`
      });
      return;
    }
    
    // Perform zone transition
    player.currentZone = targetZoneId;
    player.x = exit.targetX;
    player.y = exit.targetY;
    
    this.clients.find(c => c.sessionId === playerId)?.send("zone_transition_success", {
      newZone: targetZone,
      x: player.x,
      y: player.y
    });
    
    // For this demo, we'll keep players in the same room but track their zone
    // In a full implementation, you'd transfer them to different room instances
  }

  private handleCrafting(playerId: string, recipeId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    
    const recipe = CRAFTING_RECIPES[recipeId];
    if (!recipe) {
      this.clients.find(c => c.sessionId === playerId)?.send("craft_result", {
        success: false,
        reason: "Recipe not found"
      });
      return;
    }
    
    // Check level requirement
    if (player.level < recipe.levelRequirement) {
      this.clients.find(c => c.sessionId === playerId)?.send("craft_result", {
        success: false,
        reason: `Requires level ${recipe.levelRequirement}`
      });
      return;
    }
    
    // Check if player has required materials
    for (const material of recipe.materials) {
      const playerQuantity = player.inventory.get(material.itemId) || 0;
      if (playerQuantity < material.quantity) {
        const item = DEFAULT_ITEMS[material.itemId];
        this.clients.find(c => c.sessionId === playerId)?.send("craft_result", {
          success: false,
          reason: `Need ${material.quantity} ${item?.name || material.itemId}, have ${playerQuantity}`
        });
        return;
      }
    }
    
    // Consume materials
    recipe.materials.forEach(material => {
      const currentQuantity = player.inventory.get(material.itemId) || 0;
      const newQuantity = currentQuantity - material.quantity;
      if (newQuantity <= 0) {
        player.inventory.delete(material.itemId);
      } else {
        player.inventory.set(material.itemId, newQuantity);
      }
    });
    
    // Give result item
    const currentResult = player.inventory.get(recipe.result.itemId) || 0;
    player.inventory.set(recipe.result.itemId, currentResult + recipe.result.quantity);
    
    this.clients.find(c => c.sessionId === playerId)?.send("craft_result", {
      success: true,
      recipe: recipe,
      resultItem: DEFAULT_ITEMS[recipe.result.itemId]
    });
  }
}

function neighbor(x: number, y: number, dir: number) {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (dir === 0) return { x: tx, y: ty - 1 };
  if (dir === 1) return { x: tx + 1, y: ty };
  if (dir === 2) return { x: tx, y: ty + 1 };
  return { x: tx - 1, y: ty };
}

function sanitizeChat(s: string): string | null {
  if (typeof s !== "string") return null;
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 140) s = s.slice(0, 140);
  return s;
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }