"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Room {
  id: string;
  name: string;
  deviceCount: number;
  onlineDeviceCount: number;
}

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchRooms = () => {
    setLoading(true);
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRooms(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = Date.now().toString();
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newName.trim() }),
    });
    setNewName("");
    setShowAdd(false);
    fetchRooms();
  };

  const handleEdit = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName.trim() }),
    });
    setEditingId(null);
    fetchRooms();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">房间管理</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors"
        >
          + 新增房间
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[#101922] border border-[#1c2630] rounded-lg p-4 flex gap-3">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="房间名称"
            className="flex-1 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <button type="submit" className="px-4 py-2 bg-[#137fec] text-white text-sm rounded-md">保存</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-[#1c2630] text-[#8a9baf] text-sm rounded-md">取消</button>
        </form>
      )}

      {/* Room list */}
      {loading ? (
        <p className="text-[#4a5b70] text-sm">加载中...</p>
      ) : rooms.length === 0 ? (
        <p className="text-[#4a5b70] text-sm text-center py-10">暂无房间</p>
      ) : (
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] overflow-hidden">
          {rooms.map((room, i) => (
            <div
              key={room.id}
              className={`flex items-center justify-between px-5 py-4 ${
                i < rooms.length - 1 ? "border-b border-[#1c2630]" : ""
              }`}
            >
              {editingId === room.id ? (
                <form onSubmit={(e) => handleEdit(room.id, e)} className="flex-1 flex gap-3">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#137fec]"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-[#137fec] text-white text-xs rounded-md">保存</button>
                  <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-[#1c2630] text-[#8a9baf] text-xs rounded-md">取消</button>
                </form>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{room.name}</p>
                    <p className="text-xs text-[#4a5b70] mt-0.5">
                      {room.onlineDeviceCount}/{room.deviceCount} 台设备在线
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="px-3 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-xs rounded-md transition-colors"
                    >
                      查看设备
                    </Link>
                    <button
                      onClick={() => { setEditingId(room.id); setEditName(room.name); }}
                      className="px-3 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-xs rounded-md transition-colors"
                    >
                      重命名
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
