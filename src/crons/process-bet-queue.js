import mongoose from "mongoose";
import { helpers } from "sc-common";
import { Core } from "sc-game-base";
import { tracer } from "sc-instrument";
import { Actions } from "../constants";
import { MineConsumer, ProvablyFairConsumer, SettleCashOutConsumer } from "../consumers";
export default class ProcessBetQueue extends Core.Crons.ProcessBetQueue {
    /**
     * @param {Object} dependencies
     * @param {SettleCashOutConsumer} dependencies.settleCashOutConsumer
     * @param {ProvablyFairConsumer} dependencies.provablyFairConsumer
     * @param {mongoose.Model} dependencies.roundsRepository
     * @param {MineConsumer} dependencies.mineConsumer
     *
     * */
    constructor({
        definition,
        gameData,
        placeBetPublisher,
        placeBet,
        logService,
        betsRepository,
        betLogsRepository,
        userInfosRepository,
        baseMetrics,
        settleCashOutConsumer,
        provablyFairConsumer,
        roundResultConsumer,
        roundsRepository,
        mineConsumer,
    }) {
        super({
            definition,
            gameData,
            placeBetPublisher,
            placeBet,
            logService,
            betsRepository,
            betLogsRepository,
            userInfosRepository,
            baseMetrics,
        });

        this.settleCashOutConsumer = settleCashOutConsumer;
        this.provablyFairConsumer = provablyFairConsumer;
        this.roundResultConsumer = roundResultConsumer;
        this.roundsRepository = roundsRepository;
        this.mineConsumer = mineConsumer;
    }

    dequeueBets() {
        if (this.gameData.ingame) {
            Object.values(this.gameData.ingame).forEach((playerInGame) => {
                if (!playerInGame.betProcessing && playerInGame.betQueue && playerInGame.betQueue.length > 0) {
                    const self = this;
                    const { player, payload } = playerInGame.betQueue.shift();

                    playerInGame.betProcessing = true;

                    tracer.startActiveSpan("dequeueBet", async (span) => {
                        self.proceedActions(player, payload)
                            .then(() => (playerInGame.betProcessing = false))
                            .catch(self.logService.logError)
                            .finally(() => span.end());
                    });
                }
            });
        }
    }

    async validateBetRequest(player, payload) {
        const playerName = player.profile.name;
        const playerGameData = this.gameData.ingame[playerName];
        const activeBet = playerGameData.activeBet;

        if (activeBet) {
            this.placeBetPublisher.publishGameFailedBet(player.UID, {
                endBet: -1,
                notice: { errorCode: helpers.noticeHelper.cannotPlaceBet },
            });

            return false;
        }

        return true;
    }

    async proceedActions(player, payload) {
        switch (payload.action) {
            case Actions.Bet:
                await this.proceedBet(player, payload.bet);
                break;
            case Actions.Mine:
                await this.proceedMine(player, payload);
                break;
            case Actions.CashOut:
                await this.settleCashOutConsumer.proceedCashOut(player);
                break;
        }
    }

    composeBettingTimeValidationCriteria(roundId) {
        return [];
    }

    async handleSuccessBet(player, balance, roundId, bet) {
        const rate = this.calculateCurrencyRate(player.session);
        const playerName = player.profile.name;
        this.provablyFairConsumer.generateCrashPoint(playerName, bet.clientSeed, roundId);
        const currentMultiplier = this.gameData.provablyFair[playerName].finalResult > 1 ? 1.01 : 0;

        await this.provablyFairConsumer.createResultRecord(player.profile.name, roundId);
        await this.insertBet(player, roundId, bet, rate, currentMultiplier);
        await this.insertBetLog(player, roundId, bet, currentMultiplier);

        this.gameData.ingame[playerName].activeBet = { ...bet, currentMultiplier, tapCount: 1, maxWin: this.getMaxWinPerRound(player) };

        this.notifyPlacingBetResult(player, balance, bet, rate, roundId);

        this.gameData.addPlayerToBetList(player.UID, {
            name: playerName,
            amount: bet.amount,
            rate,
        });

        if (!bet.freeBet && (player.profile.minBet !== balance.minBet || player.profile.maxBet !== balance.maxBet)) {
            await this.updateUserStakeLevel(player, balance.minBet, balance.maxBet);
        }

        if (currentMultiplier === 0) {
            this.settleCashOutConsumer.proceedCashOut(player);
        }
    }

    generatePlacingBetResult(player, balance, bet, rate) {
        const { amount } = bet;
        const playerName = player.profile.name;
        const result = super.generatePlacingBetResult(player, balance, bet, rate);

        result.multiplier = this.gameData.ingame[playerName].activeBet.currentMultiplier;
        result.ownChip = { amount };
        result.winAmount = amount * result.multiplier;
        result.user.name = playerName;
        return result;
    }

    async insertBetLog(player, roundId, bet, currentMultiplier) {
        const rate = this.calculateCurrencyRate(player.session);

        const newBetLog = {
            uid: player.UID,
            name: player.profile.name,
            time: new Date(),
            action: bet.action,
            amount: bet.amount,
            winAmount: bet.amount * currentMultiplier,
            freeBet: bet.freeBet,
            increment: bet.increment,
            result: bet.result,
            multiplier: currentMultiplier,
            clientSendTime: bet.clientSendTime,
            receivedTime: bet.receivedTime,
            roundId,
            tapCount: bet.tapCount,
            multiplierMode: bet.multiplierMode,
        };

        if (player.session) {
            newBetLog.siteId = player.session.siteId;
            newBetLog.currency = player.session.currencyName;
            newBetLog.currencyMultiplier = player.session.multiplier;
            newBetLog.currencyGroupId = player.session.currencyGroupId;
            newBetLog.rate = rate;
            newBetLog.currencyCode = player.session.currencyCode;

            newBetLog.operatorId = player.session.operatorId;
            newBetLog.playerId = player.session.playerId;
        }

        await this.betLogsRepository.create(newBetLog);
    }

    async insertBet(player, roundId, bet, rate, currentMultiplier) {
        const { crashConfig } = this.gameData.gameConfigs;

        // Use dynamicMultiplierConfigs if turnCrashType is 1, otherwise use multiplierConfigs
        let odds;
        switch (crashConfig.turnCrashType) {
            case TurnCrashType.Dynamic:
                odds = crashConfig.dynamicMultiplierConfigs;
                break;
            default:
                odds = crashConfig.multiplierConfigs;
        }

        const newBet = {
            uid: player.UID,
            name: player.profile.name,
            time: new Date(),
            freeBet: bet.freeBet,
            id: roundId,
            amount: bet.amount,
            autoCashOut: bet.autoCashOut,
            clientSeed: bet.clientSeed,
            totalAmount: bet.amount,
            odds: odds,
            exchangeRateId: this.gameData.exchangeRates.exId,
            multiplier: currentMultiplier,
            tapCount: 1,
            multiplierMode: bet.multiplierMode,
            maxWin: this.getMaxWinPerRound(player),
        };

        if (player.session) {
            newBet.siteId = player.session.siteId;
            newBet.currency = player.session.currencyName;
            newBet.rate = rate;

            newBet.operatorId = player.session.operatorId;
            newBet.playerId = player.session.playerId;
        }

        await this.roundsRepository.create(newBet);
        return newBet.time;
    }

    decreaseBetTracks(playerName) {
        if (this.gameData.ingame?.[playerName]) {
            const playerInGame = this.gameData.ingame[playerName];

            delete playerInGame.betTracks[Actions.Bet];
        }
    }

    async proceedMine(player, payload) {
        const playerGameData = this.gameData.ingame[player.profile.name];

        if (playerGameData?.betTracks[Actions.Bet]) {
            await this.mineConsumer.mine(player, payload);
        }
    }

    notifyPlacingBetResult(player, balance, bet, rate, roundId) {
        const result = this.generatePlacingBetResult(player, balance, bet, rate);

        this.placeBetPublisher.publishSuccessBet(player.UID, { ...result, roundId }, rate);
    }

    getMaxWinPerRound(player) {
        const { maxWinPerRound } = this.gameData.gameConfigs.crashConfig;
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const maxBet = Math.min(player.profile.maxBet, settings.maxBet);

        return maxWinPerRound * maxBet;
    }
}
