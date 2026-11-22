import React, { useState, useEffect } from 'react';
import { getRoleColor } from '../constants';
import { Eye, EyeOff, Skull, Heart, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function GameDashboard({ players, setPlayers, allRoles }) {
  const [globalShowRoles, setGlobalShowRoles] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});
  const [gameOverMsg, setGameOverMsg] = useState(null);

  const getRoleInfo = (roleId) => {
    return allRoles.find(r => r.id === roleId);
  };

  useEffect(() => {
    const alivePlayers = players.filter(p => p.isAlive);
    const wolvesCount = alivePlayers.filter(p => getRoleInfo(p.role)?.team === 'WEREWOLF').length;
    const villagersCount = alivePlayers.filter(p => getRoleInfo(p.role)?.team === 'VILLAGER').length;
    
    if (players.length > 0 && alivePlayers.length > 0) {
      if (wolvesCount === 0) {
        setGameOverMsg({ title: 'DÂN LÀNG CHIẾN THẮNG!', desc: 'Tất cả Sói đã bị tiêu diệt.', team: 'VILLAGER' });
      } else if (wolvesCount >= villagersCount) {
        setGameOverMsg({ title: 'MA SÓI CHIẾN THẮNG!', desc: 'Số lượng Sói đã lớn hơn hoặc bằng Dân Làng.', team: 'WEREWOLF' });
      } else {
        setGameOverMsg(null);
      }
    }
  }, [players, allRoles]);

  const toggleAlive = (id, e) => {
    e.stopPropagation();
    setPlayers(players.map(p => p.id === id ? { ...p, isAlive: !p.isAlive } : p));
  };

  const toggleCardFlip = (id) => {
    setFlippedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const aliveCount = players.filter(p => p.isAlive).length;
  const [filterType, setFilterType] = useState('all');

  const filteredPlayers = players.filter(p => {
    if (filterType === 'all') return true;
    if (filterType === 'alive') return p.isAlive;
    if (filterType === 'dead') return !p.isAlive;
    
    const roleInfo = getRoleInfo(p.role);
    if (!roleInfo) return false;
    
    if (filterType === 'WEREWOLF') return roleInfo.team === 'WEREWOLF';
    if (filterType === 'VILLAGER') return roleInfo.team === 'VILLAGER';
    if (filterType === 'MUTANT') return roleInfo.team === 'MUTANT';
    
    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 bg-card rounded-2xl shadow-xl border border-border">
      <AnimatePresence>
        {gameOverMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "mb-6 p-4 rounded-xl flex items-start gap-4 border-2",
              getRoleColor('temp', gameOverMsg.team).bg,
              getRoleColor('temp', gameOverMsg.team).border
            )}
          >
            <AlertTriangle className="text-white" size={32} />
            <div>
              <h3 className="text-xl font-bold text-white">{gameOverMsg.title}</h3>
              <p className="text-white/90">{gameOverMsg.desc}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-1">Bảng Flashcards</h2>
          <p className="text-sm text-gray-500">
            Tổng số: {players.length} | Còn sống: <span className="text-green-500 font-bold">{aliveCount}</span> | Đã chết: <span className="text-red-500 font-bold">{players.length - aliveCount}</span>
          </p>
        </div>
        
        <button
          onClick={() => {
            setGlobalShowRoles(!globalShowRoles);
            setFlippedCards({});
          }}
          className="px-4 py-2 bg-background border border-border rounded-lg flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium text-foreground whitespace-nowrap"
        >
          {globalShowRoles ? <EyeOff size={18} /> : <Eye size={18} />}
          {globalShowRoles ? 'Úp Tất Cả' : 'Lật Tất Cả'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')}>Tất cả</FilterButton>
        <FilterButton active={filterType === 'alive'} onClick={() => setFilterType('alive')}>Còn sống</FilterButton>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredPlayers.map((player) => {
          const roleInfo = getRoleInfo(player.role);
          const style = roleInfo ? getRoleColor(roleInfo.id, roleInfo.team) : null;
          const isCardRevealed = globalShowRoles || flippedCards[player.id];
          
          return (
            <motion.div 
              layout
              key={player.id}
              onClick={() => toggleCardFlip(player.id)}
              className={cn(
                "relative aspect-[2/3] rounded-xl border-2 overflow-hidden transition-all duration-300 cursor-pointer select-none group flex flex-col",
                player.isAlive ? "bg-background border-border hover:border-gray-400" : "bg-red-950/20 border-red-900/30 grayscale opacity-80",
                (isCardRevealed && player.isAlive && style) ? style.border : ""
              )}
            >
              {/* Vùng Role (Nửa trên hoặc toàn bộ mặt trước) */}
              <div 
                className={cn(
                  "flex-1 flex items-center justify-center p-2 text-center transition-all duration-300 bg-cover bg-center",
                  isCardRevealed 
                    ? (style ? `${style.bg} ${style.whiteText}` : "bg-card text-foreground") 
                    : "group-hover:brightness-110"
                )}
                style={!isCardRevealed ? { backgroundImage: 'url(/card-back.jpg)' } : {}}
              >
                {isCardRevealed && roleInfo && (
                  <span className="font-bold text-lg leading-tight">{roleInfo.name}</span>
                )}
              </div>
              
              {/* Vùng Tên Player (Dải dưới cùng) */}
              <div className="bg-black/90 text-white p-2 text-center relative z-10 min-h-[48px] flex items-center justify-center">
                <span className={cn(
                  "font-bold text-sm truncate",
                  !player.isAlive && "line-through text-gray-500"
                )}>
                  {player.name}
                </span>
                
                {/* Nút Kill / Revive nổi lên khi hover (hoặc click) */}
                <button
                  onClick={(e) => toggleAlive(player.id, e)}
                  className={cn(
                    "absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 p-1.5 rounded-full shadow-lg transition-transform hover:scale-110",
                    player.isAlive ? "bg-red-500 text-white" : "bg-green-500 text-white"
                  )}
                  title={player.isAlive ? "Giết" : "Hồi sinh"}
                >
                  {player.isAlive ? <Skull size={14} /> : <Heart size={14} />}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
      {filteredPlayers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Không có người chơi nào khớp với bộ lọc.
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-full transition-colors border",
        active 
          ? "bg-primary text-white border-primary" 
          : "bg-background text-foreground border-border hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      {children}
    </button>
  );
}
