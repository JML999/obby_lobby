export class MobileDetectionManager {
    private static instance: MobileDetectionManager;
    private playerMobileMap: Map<string, boolean> = new Map();

    private constructor() {}

    public static getInstance(): MobileDetectionManager {
        if (!MobileDetectionManager.instance) {
            MobileDetectionManager.instance = new MobileDetectionManager();
        }
        return MobileDetectionManager.instance;
    }

    public setPlayerMobile(playerId: string, isMobile: boolean) {
        this.playerMobileMap.set(playerId, isMobile);
    }

    public isPlayerMobile(playerId: string): boolean {
        return this.playerMobileMap.get(playerId) || false;
    }

    public removePlayer(playerId: string) {
        this.playerMobileMap.delete(playerId);
    }
} 