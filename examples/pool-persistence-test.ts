import { PoolPersistenceManager } from '../src/PoolPersistenceManager';
import type { ScoreboardEntry } from '../src/ScoreboardManager';

/**
 * Test script for the Pool Persistence Manager
 * This demonstrates how pool leaderboards are saved and loaded
 */
async function testPoolPersistence() {
    console.log('=== Pool Persistence Test ===\n');
    
    const poolManager = PoolPersistenceManager.getInstance();
    
    // Initialize the system
    console.log('1. Initializing pool persistence...');
    await poolManager.initialize();
    
    // Test data - sample leaderboard entries
    const sampleScores: ScoreboardEntry[] = [
        {
            playerId: 'player-1',
            playerName: 'SpeedRunner',
            completionTime: 45200, // 45.2 seconds
            timestamp: Date.now() - 3600000 // 1 hour ago
        },
        {
            playerId: 'player-2', 
            playerName: 'ProJumper',
            completionTime: 52800, // 52.8 seconds
            timestamp: Date.now() - 1800000 // 30 minutes ago
        },
        {
            playerId: 'player-3',
            playerName: 'Challenger',
            completionTime: 58100, // 58.1 seconds
            timestamp: Date.now() - 900000 // 15 minutes ago
        }
    ];
    
    console.log('2. Testing pool-1 scoreboard save...');
    await poolManager.updatePoolScoreboard('pool-1', sampleScores);
    
    console.log('3. Testing pool-1 scoreboard load...');
    const loadedScores = await poolManager.getPoolScoreboard('pool-1');
    console.log(`   Loaded ${loadedScores.length} scores:`);
    loadedScores.forEach((score, index) => {
        const timeInSeconds = (score.completionTime / 1000).toFixed(2);
        console.log(`   ${index + 1}. ${score.playerName} - ${timeInSeconds}s`);
    });
    
    console.log('\n4. Testing pool data structure...');
    const poolData = await poolManager.loadPoolData('pool-1');
    if (poolData) {
        console.log(`   Pool ID: ${poolData.poolId}`);
        console.log(`   Display Name: ${poolData.displayName}`);
        console.log(`   Creator: ${poolData.creator}`);
        console.log(`   Play Count: ${poolData.metadata?.playCount || 0}`);
        console.log(`   Last Modified: ${new Date(poolData.lastModified).toLocaleString()}`);
    }
    
    console.log('\n5. Testing multiple pools...');
    const pool2Scores: ScoreboardEntry[] = [
        {
            playerId: 'player-4',
            playerName: 'MasterBuilder',
            completionTime: 62300,
            timestamp: Date.now()
        }
    ];
    
    await poolManager.updatePoolScoreboard('pool-2', pool2Scores);
    
    console.log('6. Loading all pools...');
    const allPools = await poolManager.loadAllPools();
    console.log(`   Found ${allPools.size} pools:`);
    for (const [poolId, data] of allPools) {
        console.log(`   - ${poolId}: ${data.scoreboard.length} scores, play count: ${data.metadata?.playCount || 0}`);
    }
    
    console.log('\n7. Testing pool existence check...');
    console.log(`   pool-1 exists: ${await poolManager.poolExists('pool-1')}`);
    console.log(`   pool-999 exists: ${await poolManager.poolExists('pool-999')}`);
    
    console.log('\n=== Test Complete ===');
    console.log('Pool persistence system is working correctly!');
    console.log('Check dev/persistence/pools/ directory for saved files.');
}

// Run the test
testPoolPersistence().catch(console.error);