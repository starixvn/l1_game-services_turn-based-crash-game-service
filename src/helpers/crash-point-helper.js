function findStage(multiplier, stages) {
    return stages.find((stage) => multiplier >= stage.minMultiplier && multiplier <= stage.maxMultiplier);
}

function calculateIncrement(currentMultiplier, multiplierConfigs) {
    const stage = multiplierConfigs.stages?.find(
        (stage) => currentMultiplier >= stage.minMultiplier && currentMultiplier < stage.maxMultiplier
    );

    return stage?.increment ?? 0;
}

function getInitialTapMultiplier(stageConfigs) {
    return stageConfigs.initialMultiplier;
}

function generateTapResult(result) {
    return result > 1.0;
}

function calculateDynamicMultiplierConfigs(multiplier, dynamicMultiplierConfigs, mode) {
    const config = dynamicMultiplierConfigs.find(config => config.mode === mode);
    if (!config) {
        return 0;
    }
    
    const values = config.values;
    const currentIndex = values.findIndex(value => value >= multiplier);
    
    if (currentIndex === -1 || currentIndex >= values.length - 1) {
        return 0;
    }
    
    return values[currentIndex + 1] - multiplier;
}

export { calculateDynamicMultiplierConfigs, calculateIncrement, findStage, generateTapResult, getInitialTapMultiplier };

