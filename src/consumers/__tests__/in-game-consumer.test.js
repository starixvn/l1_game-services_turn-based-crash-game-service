import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { Core, Table } from "sc-game-base";
import { Systems } from "sc-game-base/src/constants/systems";
import { RoundQuery } from "sc-game-base/src/core/query-apis";
import { BigWinConsumer, InGameConsumer, ProvablyFairConsumer } from "../../consumers";
import CrashGameData from "../../game-data";

describe("in game consumer instance", () => {
    const definition = {
        id: 41,
        name: "crash",
        durations: {
            wholeRound: 14,
            placingBets: 10,
            lockingBet: 3,
            liveTime: 0,
        },
    };
    const gameData = new CrashGameData(0);
    const dynamicMultiplierConfigs = [
        {
            mode: "easy",
            values: [
                1.0, 1.04, 1.09, 1.14, 1.2, 1.26, 1.33, 1.41, 1.5, 1.6, 1.71, 1.85, 2.0, 2.18, 2.4, 2.67, 3.0, 3.43, 4.0, 4.8, 6.0, 8.0,
                12.0, 24.0,
            ],
        },
        {
            mode: "medium",
            values: [
                1.09, 1.25, 1.43, 1.66, 1.94, 2.28, 2.71, 3.25, 3.94, 4.85, 6.07, 7.72, 10.04, 13.38, 18.4, 26.29, 39.43, 63.09, 110.4,
                220.8, 552.0, 2208.0,
            ],
        },
        {
            mode: "hard",
            values: [
                1.2, 1.52, 1.94, 2.51, 3.29, 4.39, 5.95, 8.24, 11.68, 16.98, 25.48, 39.63, 64.4, 110.4, 202.4, 404.8, 910.8, 2428.8, 8500.8,
                51004.8,
            ],
        },
        {
            mode: "hard core",
            values: [1.6, 2.74, 4.85, 8.9, 16.98, 33.97, 71.71, 161.35, 391.86, 1044.96, 3134.87, 10972.06, 47545.6, 285273.6, 3138009.6],
        },
    ];

    gameData.gameConfigs = {
        enableFreeBet: true,
        crashConfig: { maxMultiplier: 2000, maxWinPerRound: 2000, dynamicMultiplierConfigs },
        odds: {},
    };

    /** @type {mongoose.Model}*/
    const userInfosRepository = stubMongoose(mongoose.Model);
    const roundQuery = stub(RoundQuery);
    const publisher = stub(Core.BaseEventPublishers.BaseEventPublisher);
    const getBalance = jest.fn();
    const realPlayer = {
        UID: "123",
        socketClient: {
            emit: jest.fn(),
        },
        profile: {
            name: "player01",
        },
        session: { currencyGroupId: "group1", currencyName: "UUS", system: 1, partnerId: 2 },
    };

    const currencyGroupGame = {
        groupId: realPlayer.session.currencyGroupId,
        minBet: 1,
        maxBet: 1000000,
    };

    gameData.currencyGroupGames = [
        {
            ...currencyGroupGame,
        },
    ];

    const provablyFairConsumer = stub(ProvablyFairConsumer);

    /** @type {BigWinConsumer}*/
    const bigWinConsumer = stub(BigWinConsumer);

    const consumer = new InGameConsumer({
        definition,
        gameData,
        roundQuery,
        publisher,
        getBalance,
        userInfosRepository,
        provablyFairConsumer,
        bigWinConsumer,
    });

    it("should be instance of Table.EventConsumers.TableInGameConsumer", () => {
        expect(consumer instanceof Table.EventConsumers.TableInGameConsumer).toBeTruthy();
    });

    describe("buildPayload tests", () => {
        beforeEach(() => {
            spyOn(Table.EventConsumers.TableInGameConsumer.prototype, "buildPlayersPayload").and.returnValue({});
            spyOn(Core.BaseEventConsumers.InGameConsumer.prototype, "getUserInfo").and.returnValue({});
            spyOn(bigWinConsumer, "getRecentBigWinningWinners").and.returnValue([]);
        });

        it("should call buildPlayersPayload", async () => {
            // act
            await consumer.buildPayload(realPlayer);

            // assert
            expect(Table.EventConsumers.TableInGameConsumer.prototype.buildPlayersPayload).toHaveBeenCalled();
        });

        it("should call getBalance", async () => {
            // act
            await consumer.buildPayload(realPlayer);

            // assert
            expect(getBalance).toHaveBeenCalled();
        });

        it("should call getUserInfo", async () => {
            // act
            await consumer.buildPayload(realPlayer);

            // assert
            expect(Table.EventConsumers.TableInGameConsumer.prototype.getUserInfo).toHaveBeenCalled();
        });

        it("should call getRecentBigWinningWinners", async () => {
            // act
            await consumer.buildPayload(realPlayer);

            // assert
            expect(bigWinConsumer.getRecentBigWinningWinners).toHaveBeenCalled();
        });

        it("should return correct result", async () => {
            // arrange

            const expectedResult = {
                gameConfigs: {
                    ...currencyGroupGame,
                    enableFreeBet: gameData.gameConfigs.enableFreeBet,
                    maxWinPerRound: gameData.gameConfigs.crashConfig.maxWinPerRound,
                    odds: gameData.gameConfigs.odds,
                    dynamicMultiplierConfigs,
                },
                user: {},
                players: {},
                recentBigWinningWinners: [],
            };

            // act
            const actualResult = await consumer.buildPayload(realPlayer);

            // assert
            expect(actualResult).toStrictEqual(expectedResult);
        });
    });

    describe("consume tests", () => {
        const payload = {
            gameConfigs: {
                ...currencyGroupGame,
                enableFreeBet: gameData.gameConfigs.enableFreeBet,
                maxWinPerRound: gameData.gameConfigs.crashConfig.maxWinPerRound,
                odds: gameData.gameConfigs.odds,
                dynamicMultiplierConfigs,
            },
            user: {},
            players: {},
            recentBigWinningWinners: [],
        };

        beforeEach(() => {
            spyOn(consumer, "buildPayload").and.returnValue(payload);
            spyOn(provablyFairConsumer, "generateServerSeedAndPublishHash").and.returnValue({});
        });

        it("should call buildPayload", async () => {
            // act
            await consumer.consume(realPlayer);

            // assert
            expect(consumer.buildPayload).toHaveBeenCalledWith(realPlayer);
        });

        it("should call provablyFairConsumer", async () => {
            // act
            await consumer.consume(realPlayer);

            // assert
            expect(provablyFairConsumer.generateServerSeedAndPublishHash).toHaveBeenCalledWith(realPlayer.UID, realPlayer.profile.name);
        });

        it("should call publisher", async () => {
            // arrange
            const player = {
                id: realPlayer.UID,
                name: realPlayer.profile.name,
                red: payload.user.red,
                avatarId: payload.user.avatarId,
                type: payload.user.type,
            };

            // act
            await consumer.consume(realPlayer);

            // assert
            expect(publisher.publishToAllUsersExceptSystem).toHaveBeenCalledWith(Systems.Mobi, realPlayer.UID, { player });
        });

        it("should emit correct payload", async () => {
            // act
            await consumer.consume(realPlayer);

            // assert
            expect(realPlayer.socketClient.emit).toHaveBeenCalledWith(definition.name, payload);
        });
    });
});
