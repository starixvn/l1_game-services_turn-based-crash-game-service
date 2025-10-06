import Chance from "chance";
import { helpers, logger } from "sc-common";
import { Table } from "sc-game-base";
import { Systems } from "sc-game-base/src/constants";
import { SeedHelper, ServerSeedHelper } from "sc-game-base/src/core/helpers";
import * as util from "util";
import { Actions, TurnCrashType } from "../constants";
import { BigWinConsumer } from "../consumers";
import { RecentBigWinPublisher } from "../event-publishers";
import { calculateDynamicMultiplierConfigs, calculateIncrement } from "../helpers/crash-point-helper";
import { roundFloat } from "../helpers/number-helper";
import { isBigWin } from "../helpers/result-helper";

export default class GameBot extends Table.Crons.TableGameBot {
    /**
     * @param {BigWinConsumer} bigWinConsumer
     * @param {RecentBigWinPublisher} recentBigWinPublisher
     */
    constructor(definition, gameData, publisher, userInfosRepository, bigWinConsumer, recentBigWinPublisher) {
        super(definition, gameData, publisher, userInfosRepository);
        this.chance = new Chance();
        this.activeBots = new Map();
        this.minBotsAtTheTable = 4;
        this.maxBotsAtTheTable = 8;
        this.activeTimeouts = new Set();
        this.bigWinConsumer = bigWinConsumer;
        this.recentBigWinPublisher = recentBigWinPublisher;
    }

    async run() {
        if (!this.gameData.gameConfigs?.botenabled) {
            return;
        }

        this.clearTimeouts();

        const random = this.chance.integer({ min: 0, max: 5 });

        if (this.shouldAddBot(random)) {
            await this.joinRoom();
        }

        if (this.shouldRemoveBot(random)) {
            await this.leaveRoom();
        }

        const botIds = Object.keys(this.botsInRoom);
        botIds.forEach((botId) => {
            const delay = this.chance.integer({ min: 0, max: 800 });
            const timeout = setTimeout(() => {
                this.handleBotActions(botId).catch((error) => {
                    logger.logError(`Error handling bot action for ${botId}: ${util.inspect(error)}`);
                });
                this.activeTimeouts.delete(timeout);
            }, delay);
            this.activeTimeouts.add(timeout);
        });
    }

    clearTimeouts() {
        for (const timeout of this.activeTimeouts) {
            clearTimeout(timeout);
        }
        this.activeTimeouts.clear();
    }

    async placeBet(botId) {
        this.gameData.roundId += 1;
        const maxBet = this.getMaxBet(this.botsInRoom[botId]);
        const minBet = this.getMinBet();
        const betAmount = this.convertAmountToChip(helpers.numberHelper.getRandomNumberStep5(minBet, maxBet, true));

        const user = await this.userInfosRepository.findOneAndUpdate(
            { id: botId, red: { $gt: betAmount } },
            { $inc: { red: -betAmount } },
            { new: true, lean: true }
        );

        if (user) {
            const serverSeed = ServerSeedHelper.generateServerSeed();
            const finalHash = SeedHelper.getSHA512Hash(serverSeed);
            const result = this.definition.generateResult(finalHash);
            const multiplier = result > 1 ? 1.01 : 0;
            const turnCrashType = this.gameData.gameConfigs.crashConfig.turnCrashType ?? TurnCrashType.Increment;

            this.updateBalanceAndPublishBetPayload(botId, multiplier, betAmount, user.red);

            // Set multiplierMode for bots if turnCrashType is 1
            const multiplierMode = turnCrashType === TurnCrashType.Dynamic ? this.chance.integer({ min: 1, max: 4 }) : 0;

            this.activeBots.set(botId, {
                amount: betAmount,
                result,
                multiplier,
                tapCount: 1,
                lastActionTime: Date.now(),
                multiplierMode,
            });

            if (multiplier === 0) {
                await this.handleCashout(botId);
            }
        }
    }

    updateBalanceAndPublishBetPayload(botId, multiplier, amount, balance) {
        if (this.gameData.players[botId]) {
            this.gameData.players[botId].red = balance;
        }

        this.publisher.publishToAllUsersExceptSystem(Systems.Mobi, null, {
            playerChip: {
                playerId: botId,
                rate: 1,
                multiplier: multiplier,
                amount: amount,
                red: balance,
            },
        });
    }

    async handleBotActions(botId) {
        try {
            const action = this.getAction(botId);

            switch (action) {
                case Actions.Bet:
                    await this.placeBet(botId);
                    break;
                case Actions.Mine:
                    await this.handleMining(botId);
                    break;
                case Actions.CashOut:
                    await this.handleCashout(botId);
                    break;
            }
        } catch (error) {
            logger.logError(error);
        }
    }

    getRemovalBotIds(totalRemoval) {
        const botIds = Object.keys(this.botsInRoom).filter((botId) => !this.activeBots.has(botId));
        if (!this.removeBotAtTheTable) {
            this.removeBotAtTheTable = true;

            const botsOnTable = botIds?.length > 8 ? botIds.slice(0, 8) : botIds;

            return botsOnTable?.length > 3 ? this.chance.pickset(botsOnTable, this.chance.integer({ min: 1, max: 3 })) : botsOnTable;
        }

        return botIds?.length > totalRemoval ? this.chance.pickset(Object.keys(this.botsInRoom), totalRemoval) : botIds;
    }

    getAction(botId) {
        const botState = this.activeBots.get(botId);
        let action = null;

        if (!botState) {
            const isBet = this.chance.bool({ likelihood: 30 });
            action = isBet ? Actions.Bet : null;
        } else {
            action = this.chance.weighted(
                [Actions.Mine, Actions.CashOut, null],
                [75 - botState.tapCount, botState.tapCount, 25 + botState.tapCount * 2]
            );
        }

        return action;
    }

    async handleMining(botId) {
        const botState = this.activeBots.get(botId);

        let increment = 0;
        let updatedMultiplier = 0;
        const turnCrashType = this.gameData.gameConfigs.crashConfig.turnCrashType ?? TurnCrashType.Increment;
        
        // Use dynamic calculation if turnCrashType is 1 and bot has multiplierMode
        if (turnCrashType === TurnCrashType.Dynamic && botState.multiplierMode) {
            increment = calculateDynamicMultiplierConfigs(
                botState.multiplier,
                this.gameData.gameConfigs.dynamicMultiplierConfigs,
                botState.multiplierMode
            );
        } else {
            increment = calculateIncrement(botState.multiplier, this.gameData.gameConfigs.crashConfig.multiplierConfigs);
        }

        updatedMultiplier = roundFloat(botState.multiplier + increment);
        updatedMultiplier = updatedMultiplier > 1000 || updatedMultiplier > botState.result ? 0 : updatedMultiplier;

        botState.hasMined = true;
        botState.lastActionTime = Date.now();
        botState.multiplier = updatedMultiplier;
        botState.tapCount++;
        this.activeBots.set(botId, botState);

        this.publisher.publishToAllUsersExceptSystem(Systems.Mobi, null, {
            playerMine: { playerId: botId, multiplier: updatedMultiplier },
        });

        if (updatedMultiplier === 0) {
            await this.handleCashout(botId);
        }
    }

    async handleCashout(botId) {
        const botState = this.activeBots.get(botId);

        let recentBigWinningWinner = {};
        const multiplier = botState.multiplier;
        const rate = this.botRate;
        const amount = botState.amount;
        const baseAmount = amount * rate;
        const winningAmount = multiplier * amount;
        const baseWinningAmount = winningAmount * rate;

        const user = await this.userInfosRepository.findOneAndUpdate({ id: botId }, { $inc: { red: +winningAmount } });

        if (this.gameData.players[botId]) {
            this.gameData.players[botId].red = user.red;
            user.profile = { name: user.name };
        }
        if (isBigWin(multiplier)) {
            recentBigWinningWinner = await this.bigWinConsumer.add(user, {
                roundId: this.gameData.roundId,
                amount,
                baseAmount,
                winningAmount,
                baseWinningAmount,
                multiplier,
                rate,
            });
            this.recentBigWinPublisher.publish(recentBigWinningWinner);
        }

        this.publisher.publishToAllUsersExceptSystem(Systems.Mobi, null, {
            winners: { playerId: botId, bet: winningAmount, rate, reachMaxWin: false, win: winningAmount > 0 },
        });

        this.activeBots.delete(botId);
    }

    resetBot(bot) {
        this.clearTimeouts();
        super.resetBot(bot);
        this.activeBots.delete(bot.id);
    }

    async removeBot(botId) {
        this.clearTimeouts();
        this.activeBots.delete(botId);
        await super.removeBot(botId);
    }

    getMaxBet(bot) {
        const maxBet = bot.profile?.maxBet || this.gameData.gameConfigs.maxbet;
        return Math.min(maxBet, bot.red, this.gameData.gameConfigs.bot_maxbet);
    }

    getBetChoice() {
        return Actions.Bet;
    }

    getBotsToJoin(botUsers) {
        const remaining = this.maxNumberOfBots - Object.keys(this.botsInRoom).length;
        if (remaining < 1) {
            return [];
        }

        const numberOfBotsToJoin = this.chance.integer({ min: 1, max: remaining });
        const shuffleBots = this.chance.shuffle(botUsers);

        return shuffleBots.slice(0, numberOfBotsToJoin);
    }
}
