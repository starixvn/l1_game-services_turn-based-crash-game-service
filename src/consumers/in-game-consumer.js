import { Systems } from "sc-game-base/src/constants/systems";
import { EventConsumers } from "sc-game-base/src/table";
import { BigWinConsumer, ProvablyFairConsumer } from "./index";

export class InGameConsumer extends EventConsumers.TableInGameConsumer {
    /**
     * @param {Object} dependencies
     * @param {ProvablyFairConsumer} dependencies.provablyFairConsumer
     * @param {BigWinConsumer} dependencies.bigWinConsumer
     */

    constructor({ definition, gameData, roundQuery, publisher, getBalance, userInfosRepository, provablyFairConsumer, bigWinConsumer }) {
        super(definition, gameData, roundQuery, publisher, getBalance, userInfosRepository);
        this.provablyFairConsumer = provablyFairConsumer;
        this.bigWinConsumer = bigWinConsumer;
    }

    async consume(realPlayer) {
        const payload = await this.buildPayload(realPlayer);
        const player = {
            id: realPlayer.UID,
            name: realPlayer.profile.name,
            red: payload.user.red,
            avatarId: payload.user.avatarId,
            type: payload.user.type,
        };

        if (!this.gameData.players[realPlayer.UID]) {
            this.gameData.players[realPlayer.UID] = player;
        }

        realPlayer.socketClient.emit(this.definition.name, payload);
        this.provablyFairConsumer.generateServerSeedAndPublishHash(realPlayer.UID, realPlayer.profile.name);
        this.publisher.publishToAllUsersExceptSystem(Systems.Mobi, realPlayer.UID, { player });
    }

    async buildPayload(realPlayer) {
        const { session } = realPlayer;

        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === session.currencyGroupId);

        const { odds, enableFreeBet, crashConfig } = this.gameData.gameConfigs;

        const gameConfigs = {
            ...settings,
            odds,
            enableFreeBet,
            maxWinPerRound: crashConfig.maxWinPerRound,
            dynamicMultiplierConfigs: crashConfig.dynamicMultiplierConfigs,
        };
        const players = realPlayer.session?.system === Systems.Mobi ? {} : this.buildPlayersPayload(realPlayer);

        await this.getBalance(realPlayer, true);

        const user = await this.getUserInfo(realPlayer.UID);
        const recentBigWinningWinners = await this.bigWinConsumer.getRecentBigWinningWinners(realPlayer);
        return {
            gameConfigs,
            user,
            players,
            recentBigWinningWinners,
        };
    }
}
