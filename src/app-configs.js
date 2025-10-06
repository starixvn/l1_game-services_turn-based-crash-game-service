export default {
    hostingPort: 5000,
    apiSettings: {
        enabledApi: true,
        apiUrl: "https://l2-proxy.lumigame.com/game-api",
        authUrl: "https://l2-auth.lumigame.com",
        client: {
            id: "game-server",
            secret: "gameserver@20luminet&",
        },
        useAuthenticate: true,
        requestTimeout: 10000,
        placeBetTimeout: 2000,
        enabledApiLogs: true,
    },
    authenticateSettings: {
        url: "http://l2-auth.lumigame.com",
        id: "game-services",
        secret: "gameservices@20luminet&",
        requestTimeout: 10000,
        useAuthenticate: true,
        audiences: ["api", "admin-api"],
    },
    userServiceSettings: {
        url: "https://l2-proxy.lumigame.com/user",
    },
    socketOptions: {
        pingInterval: 60 * 1000,
        pingTimeout: 60 * 1000,
        transports: ["websocket"],
        allowUpgrades: false,
        perMessageDeflate: false,
    },
    enabledLogs: true,
    database: {
        url: "mongodb://127.0.0.1:27017/",
        options: {
            dbName: "minigame",
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    },
    sentry: {
        sentryUrl: "https://13f39b8359404ed5aec23655e64ccf78@sentry.lumigame.com/2",
        logIdentifier: "crash-game",
        env: "DEV",
    },
    adminSecretKey: "asWDEerfOIdgsdqRTFabvmgh",
    enableCorsWs: false,
    corsUrls: ["http://localhost:7456", "http://localhost:7000", "http://games.lumigame.com", "http://admin.lumigame.com"],
    chips: [1000, 500, 200, 100, 50, 10, 5, 1],
    maxQuickBets: 5,
    gameResultSettings: {
        baseUrl: "https://l2-result.lumigame.com",
        id: "Game Service",
        key: "58148de3-b895-4f6b-82de-a35eed1b4b28",
    },
};
