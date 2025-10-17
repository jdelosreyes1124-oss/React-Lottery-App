import React from 'react';

const NumberBall = ({ number, isBonus = false, delay = 0, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-12 h-12 text-lg',
    md: 'w-16 h-16 text-xl',
    lg: 'w-20 h-20 text-2xl'
  };

  const baseClasses = `
    ${sizeClasses[size]} 
    rounded-full flex items-center justify-center 
    text-white font-bold shadow-lg
    transform transition-all duration-300 hover:scale-110
  `;

  const ballClasses = isBonus 
    ? `${baseClasses} bonus-ball`
    : `${baseClasses} number-ball bg-gradient-to-br from-blue-500 to-blue-600`;

  return (
    <div 
      className={ballClasses}
      style={{ 
        animationDelay: `${delay}ms`,
        animationFillMode: 'both'
      }}
    >
      {number}
    </div>
  );
};

export default NumberBall;