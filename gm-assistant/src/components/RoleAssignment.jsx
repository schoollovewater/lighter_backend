import React from 'react';
import { getRoleColor, NIGHT_ORDER } from '../constants';
import { Shield, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function RoleAssignment({ players, setPlayers, expandedRoles, onNext, onPrev }) {
  
  const handlePlayerAssign = (roleInstId, playerId) => {
    setPlayers(players.map(p => {
      // Bỏ role của player này nếu họ đã được gán trước đó (để tránh 1 người ôm 2 thẻ)
      let newP = { ...p };
      if (newP.id === playerId) {
        newP.roleInstId = roleInstId;
        newP.role = expandedRoles.find(r => r.instanceId === roleInstId)?.id; // Lưu id gốc để tiện query
      } else if (newP.roleInstId === roleInstId) {
        // Gỡ role khỏi người đang giữ thẻ này trước đó
        newP.roleInstId = null;
        newP.role = null;
      }
      return newP;
    }));
  };

  const updatePlayerNote = (id, noteKey, value) => {
    setPlayers(players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          notes: {
            ...(p.notes || {}),
            [noteKey]: value
          }
        };
      }
      return p;
    }));
  };

  // Check xem còn thẻ nào chưa có chủ
  const assignedCount = players.filter(p => p.roleInstId !== null).length;
  const isAllAssigned = assignedCount === expandedRoles.length;

  const sortedExpandedRoles = [...expandedRoles].sort((a, b) => {
    const idxA = NIGHT_ORDER.indexOf(a.id);
    const idxB = NIGHT_ORDER.indexOf(b.id);
    const rankA = idxA !== -1 ? idxA : 999;
    const rankB = idxB !== -1 ? idxB : 999;
    return rankA - rankB;
  });

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-card rounded-2xl shadow-xl border border-border">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-foreground mb-2">Gán Vai Trò</h2>
        <p className="text-sm text-gray-500">Quản trò chọn thẻ bài (bên trái) và gán cho người chơi (bên phải).</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-h-[60vh] overflow-y-auto pr-2 content-start">
        {sortedExpandedRoles.map((role, index) => {
          const style = getRoleColor(role.id, role.team);
          const assignedPlayer = players.find(p => p.roleInstId === role.instanceId);

          return (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={role.instanceId} 
              className="flex flex-col border border-border rounded-xl overflow-hidden bg-background shadow-sm"
            >
              <div className="flex h-16">
                {/* Cột trái: Thẻ Bài */}
                <div className={cn(
                  "w-1/2 flex items-center justify-center font-bold text-sm px-2 text-center",
                  style.bg, style.whiteText
                )}>
                  {role.name}
                </div>
                
                {/* Cột phải: Chọn người chơi */}
                <div className="w-1/2 flex items-center">
                  <select
                    value={assignedPlayer ? assignedPlayer.id : ''}
                    onChange={(e) => handlePlayerAssign(role.instanceId, e.target.value)}
                    className={cn(
                      "w-full h-full bg-transparent px-3 outline-none cursor-pointer text-sm font-medium",
                      !assignedPlayer ? 'text-gray-500 italic' : 'text-foreground'
                    )}
                  >
                    <option value="" disabled>-- Chọn người --</option>
                    {players.map(p => {
                      // Disable option nếu người này đã có thẻ khác (trừ khi chính là họ)
                      const isTaken = p.roleInstId !== null && p.roleInstId !== role.instanceId;
                      return (
                        <option key={p.id} value={p.id} disabled={isTaken}>
                          {p.name} {isTaken ? '(Đã có bài)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Ghi chú chọn bạn của Thần Tình Yêu (Nằm ngay trang 2) */}
              {role.id === 'than_tinh_yeu' && assignedPlayer && (
                <div className="bg-pink-950/20 p-3 border-t border-pink-900/30 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-pink-500 font-medium whitespace-nowrap">Cặp đôi 1:</span>
                    <select
                      value={assignedPlayer.notes?.lover1 || ''}
                      onChange={(e) => updatePlayerNote(assignedPlayer.id, 'lover1', e.target.value)}
                      className="flex-1 bg-background border border-pink-900/50 rounded px-2 py-1 text-foreground focus:outline-none focus:border-pink-500"
                    >
                      <option value="">-- Chọn --</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-pink-500 font-medium whitespace-nowrap">Cặp đôi 2:</span>
                    <select
                      value={assignedPlayer.notes?.lover2 || ''}
                      onChange={(e) => updatePlayerNote(assignedPlayer.id, 'lover2', e.target.value)}
                      className="flex-1 bg-background border border-pink-900/50 rounded px-2 py-1 text-foreground focus:outline-none focus:border-pink-500"
                    >
                      <option value="">-- Chọn --</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Ghi chú chọn người nhân bản của Nhân Bản */}
              {role.id === 'nhan_ban' && assignedPlayer && (
                <div className="bg-cyan-950/20 p-3 border-t border-cyan-900/30 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-cyan-500 font-medium whitespace-nowrap">Nhân bản ai:</span>
                    <select
                      value={assignedPlayer.notes?.doppelganger_target || ''}
                      onChange={(e) => updatePlayerNote(assignedPlayer.id, 'doppelganger_target', e.target.value)}
                      className="flex-1 bg-background border border-cyan-900/50 rounded px-2 py-1 text-foreground focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">-- Chọn người --</option>
                      {players.map(p => (
                        p.id !== assignedPlayer.id && (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        )
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="flex justify-between border-t border-border pt-6 mt-auto">
        <button
          onClick={onPrev}
          className="px-6 py-3 bg-background border border-border text-foreground font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          Quay lại
        </button>
        <button
          onClick={onNext}
          disabled={!isAllAssigned}
          className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          Vào Trận
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
