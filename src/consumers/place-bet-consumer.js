import { helpers } from "sc-common";
import { Core } from "sc-game-base";
import { Actions, TurnCrashType } from "../constants";

export class PlaceBetConsumer extends Core.BaseEventConsumers.PlaceBetConsumer {
    composeValidationCriteria(player, payload) {
        const bettingTimeValidationCriteria = this.composeBettingTimeValidationCriteria(player);
        const multiplierModeValidationCriteria = this.composeMultiplierModeValidationCriteria(payload);
        const betAmountValidationCriteria = this.composeBetAmountValidationCriteria(player, payload.amount);
        const clientSeedValidationCriteria = this.composeClientSeedValidationCriteria(payload.clientSeed);

        return bettingTimeValidationCriteria.concat(
            multiplierModeValidationCriteria,
            betAmountValidationCriteria,
            clientSeedValidationCriteria
        );
    }

    composeBettingTimeValidationCriteria(player) {
        const runningRound = this.gameData.ingame[player.profile.name]?.activeBet;
        const configs = this.gameData.gameConfigs;

        return [
            {
                failure: !configs.enabled || !!runningRound,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    composeMultiplierModeValidationCriteria(payload) {
        const turnCrashType = this.gameData.gameConfigs.crashConfig.turnCrashType ?? TurnCrashType.Increment;
        switch (turnCrashType) {
            case TurnCrashType.Dynamic:
                return [
                    {
                        failure: ![1, 2, 3, 4].includes(payload.multiplierMode),
                        notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
                    },
                ];
            default:
                return [];
        }
    }

    composeBetAmountValidationCriteria(player, amount) {
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const minBet = Math.max(player.profile.minBet, settings.minBet);
        const maxBet = Math.min(player.profile.maxBet, settings.maxBet);

        return [
            {
                failure: amount < minBet,
                notice: this.getNoticeObj(helpers.noticeHelper.minBet, { minBet }),
            },
            {
                failure: amount > maxBet,
                notice: this.getNoticeObj(helpers.noticeHelper.maxBet, { maxBet }),
            },
        ];
    }

    composeClientSeedValidationCriteria(clientSeed) {
        return [
            {
                failure: !clientSeed || typeof clientSeed !== "string" || clientSeed.length > 4 || !/^\d+$/.test(clientSeed),
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet, { clientSeed }),
            },
        ];
    }

    validateBetRequest(player, payload) {
        const criteria = this.composeValidationCriteria(player, payload);
        const failedCriterion = criteria.find((criterion) => criterion.failure);

        if (failedCriterion) {
            this.publisher.publishToUser(player.UID, { endBet: -1, notice: failedCriterion.notice });

            return false;
        }

        return true;
    }

    consume(player, payload) {
        payload.action === Actions.Bet && this.gameData.roundId++;
        Object.assign(payload, {
            amount: payload.amount >> 0,
            receivedTime: new Date(),
            mode: payload.m ?? this.DisplayMode.Landscape,
            roundId: this.gameData.roundId,
            clientSeed: payload.clientSeed, //TODO: remove default value
        });

        if (
            (payload.action === Actions.Mine && !this.validateMineRequest(player)) ||
            (payload.action === Actions.Bet && !this.validateBetRequest(player, payload))
        ) {
            return;
        }

        const name = player.profile.name;
        if (!this.gameData.ingame[name]) {
            const { currencyName: currency, system, operatorId } = player.session;
            const newPlayer = {
                name,
                currency,
                system,
                operatorId,
                betTracks: {},
                betQueue: [],
            };

            this.gameData.ingame[name] = newPlayer;
        }

        if (!this.gameData.ingame[name].betQueue) {
            this.gameData.ingame[name].betQueue = [];
        }

        this.adjustBetTracks(player.profile.name, payload);

        this.gameData.ingame[name].betQueue.push({ player, payload: { action: payload.action, bet: payload } });
    }

    validateMineRequest(player) {
        const name = player.profile.name;

        if (!this.gameData.ingame[name]?.betTracks[Actions.Bet] || this.gameData.ingame[name]?.betTracks[Actions.CashOut]) {
            this.publisher.publishToUser(player.UID, { endBet: -1, notice: helpers.noticeHelper.invalidMine });
            return false;
        }

        return true;
    }

    adjustBetTracks(playerName, bet) {
        const { action, amount } = bet;

        if (this.gameData.ingame?.[playerName]) {
            const playerInGame = this.gameData.ingame[playerName];

            playerInGame.betTracks[action] = {
                amount,
                time: bet.receivedTime,
                roundId: bet.roundId,
                tapCount: 1,
                multiplier: 1,
                multiplierMode: bet.multiplierMode,
            };
        }
    }
}
