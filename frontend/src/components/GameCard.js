import React, { useState } from 'react';
import { Zap, TrendingUp, BarChart3 } from 'lucide-react';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';

const GameCard = ({ 
  gameType, 
  isSelected, 
  onSelect, 
  onPredict, 
  prediction, 
  isLoading,
  analysis 
}) => {
  const [showAnalysis, setShowAnalysis] = useState(false);

  const gameInfo = {
    '539': {
      title: '539 Lottery',
      description: 'Pick 5 numbers from 1-39',
      icon: '🎲',
      color: 'from-purple-500 to-purple-600',
      maxNumbers: 39
    },
    'mark6': {
      title: 'Mark 6',
      description: 'Pick 6 numbers + 1 bonus from 1-49',
      icon: '🎯',
      color: 'from-green-500 to-green-600',
      maxNumbers: 49
    },
    'lotto649': {
      title: 'Lotto 649',
      description: 'Pick 6 numbers + 1 bonus from 1-49',
      icon: '💎',
      color: 'from-red-500 to-red-600',
      maxNumbers: 49
    }
  };

  const info = gameInfo[gameType];

  return (
    <div 
      className={`game-card p-6 rounded-xl cursor-pointer ${
        isSelected ? 'selected' : 'bg-white hover:bg-gray-50'
      } shadow-lg`}
      onClick={() => onSelect(gameType)}
    >
      {/* Card Header */}
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">{info.icon}</div>
        <h3 className="text-xl font-bold text-gray-800">{info.title}</h3>
        <p className="text-gray-600 text-sm">{info.description}</p>
      </div>

      {/* Selected Game Actions */}
      {isSelected && (
        <div className="space-y-4 animate-slide-up">
          {/* Predict Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPredict(gameType);
            }}
            disabled={isLoading}
            className={`predict-btn w-full py-3 px-4 bg-gradient-to-r ${info.color} 
                      text-white rounded-lg font-semibold hover:shadow-lg 
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center space-x-2`}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" text="" />
                <span>🤖 AI Generating...</span>
              </>
            ) : (
              <>
                <Zap size={20} />
                <span>Generate AI Prediction</span>
              </>
            )}
          </button>

          {/* Analysis Toggle */}
          {analysis && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAnalysis(!showAnalysis);
              }}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 
                        text-gray-700 rounded-lg text-sm flex items-center 
                        justify-center space-x-2 transition-colors"
            >
              <BarChart3 size={16} />
              <span>{showAnalysis ? 'Hide' : 'Show'} Analysis</span>
            </button>
          )}

          {/* Prediction Results */}
          {prediction && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center justify-center space-x-2">
                  <TrendingUp size={18} />
                  <span>AI Predicted Numbers</span>
                </h4>
                
                {/* Main Numbers */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {prediction.numbers.map((number, index) => (
                    <NumberBall 
                      key={`${gameType}-${number}`} 
                      number={number} 
                      delay={index * 100}
                    />
                  ))}
                </div>

                {/* Bonus Number */}
                {prediction.bonus && (
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Bonus Number</p>
                    <div className="flex justify-center">
                      <NumberBall 
                        number={prediction.bonus} 
                        isBonus={true}
                        delay={600}
                      />
                    </div>
                  </div>
                )}

                {/* Prediction Metadata */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Confidence:</span>
                      <span className="font-semibold">
                        {Math.round((prediction.confidence || 0.75) * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Algorithms:</span>
                      <span className="font-semibold">
                        {prediction.algorithms?.length || 4}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Generated:</span>
                      <span className="font-semibold">
                        {new Date(prediction.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Display */}
          {showAnalysis && analysis && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg animate-slide-up">
              <h5 className="font-semibold text-blue-800 mb-2">Game Analysis</h5>
              <div className="text-xs text-blue-700 space-y-1">
                <div>Historical Data: {analysis.historicalCount} draws</div>
                <div>Hot Numbers: {analysis.trends?.hotNumbers?.slice(0, 5).join(', ')}</div>
                <div>Cold Numbers: {analysis.trends?.coldNumbers?.slice(0, 5).join(', ')}</div>
                <div>
                  Avg Sum: {Math.round(analysis.patterns?.sumRanges?.avg || 0)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GameCard;