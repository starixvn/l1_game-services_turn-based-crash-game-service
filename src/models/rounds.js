import mongoose from "mongoose";

const Schema = new mongoose.Schema({
    siteId: { type: String },
    operatorId: { type: String, required: true },
    playerId: { type: String },

    id: { type: Number, required: true },
    time: { type: Date, default: new Date() },
    exchangeRateId: { type: Number, required: true },
    tapCount: { type: Number, required: true },
    uid: { type: String, required: true },
    name: { type: String, required: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    odds: { type: Object, required: true },
    betwin: { type: Number },
    betWin: { type: Number },
    result: { type: Number },
    maxWin: { type: Number },
    reachMaxWin: { type: Boolean, default: false },
    settlementResult: { type: Array },
    paid: { type: Boolean, default: false },
    multiplier: { type: Number, required: true },
    multiplierMode: { type: Number, default: 0 },
});

export default function (gameConfigName) {
    return mongoose.model(`${gameConfigName}_rounds`, Schema);
}
