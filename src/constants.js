const Actions = {
    Bet: "bet",
    Mine: "mine",
    CashOut: "cashOut",
    HalfCashOut: "halfCashOut",
    Refund: "refund",
    Crash: "crash",
};

const MinMultiplierValue = 1.01;

const MaxDeltaTime = 60000;

const MaxCombinedClientSeeds = 5;

const ClientSeedRange = { min: 0, max: 9999 };

const Chips = [
    20_000_000, 5_000_000, 1_000_000, 500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1,
];

const TurnCrashType = {
    Increment: 0,
    Dynamic: 1,
};

export { Actions, Chips, ClientSeedRange, MaxCombinedClientSeeds, MaxDeltaTime, MinMultiplierValue, TurnCrashType };

