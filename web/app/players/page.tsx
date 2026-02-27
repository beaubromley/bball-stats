"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

interface Player {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  groupme_user_id: string | null;
  groupme_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export default function PlayersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", full_name: "", groupme_user_id: "", status: "", notes: "" });
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", full_name: "", groupme_user_id: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/login");
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchPlayers();
    }
  }, [isAdmin]);

  async function fetchPlayers() {
    try {
      const res = await fetch(`${API_BASE}/players?status=all`);
      const data = await res.json();
      setPlayers(data.players || []);
    } catch {
      setError("Failed to load players");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      setError("First and last name are required");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: addForm.first_name.trim(),
          last_name: addForm.last_name.trim(),
          full_name: addForm.full_name.trim() || undefined,
          groupme_user_id: addForm.groupme_user_id.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add player");
        return;
      }
      setAddForm({ first_name: "", last_name: "", full_name: "", groupme_user_id: "" });
      setShowAdd(false);
      fetchPlayers();
    } catch {
      setError("Failed to add player");
    }
  }

  function startEdit(player: Player) {
    setEditingId(player.id);
    setEditForm({
      first_name: player.first_name || "",
      last_name: player.last_name || "",
      full_name: player.full_name || "",
      groupme_user_id: player.groupme_user_id || "",
      status: player.status,
      notes: player.notes || "",
    });
    setError(null);
  }

  async function handleSave(id: string) {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/players/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          full_name: editForm.full_name.trim() || null,
          groupme_user_id: editForm.groupme_user_id.trim() || null,
          status: editForm.status,
          notes: editForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update player");
        return;
      }
      setEditingId(null);
      fetchPlayers();
    } catch {
      setError("Failed to update player");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}? This will only work for players with no game history.`)) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/players/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete player");
        return;
      }
      fetchPlayers();
    } catch {
      setError("Failed to delete player");
    }
  }

  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold font-display uppercase tracking-wide">Players</h1>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(null); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showAdd ? "Cancel" : "Add Player"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Player Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 mb-3">New Player</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="First name *"
              value={addForm.first_name}
              onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
              className="px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Last name *"
              value={addForm.last_name}
              onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
              className="px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Full name (optional)"
              value={addForm.full_name}
              onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
              className="px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="GroupMe user_id (optional)"
              value={addForm.groupme_user_id}
              onChange={(e) => setAddForm({ ...addForm, groupme_user_id: e.target.value })}
              className="px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {/* Players Table */}
      {loading ? (
        <div className="text-gray-500 text-center py-16">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 text-xs font-display uppercase tracking-wider">
                <th className="py-2 pr-3">Display Name</th>
                <th className="py-2 pr-3">First</th>
                <th className="py-2 pr-3">Last</th>
                <th className="py-2 pr-3">Full Name</th>
                <th className="py-2 pr-3">GroupMe</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Notes</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr
                  key={player.id}
                  className={`border-b border-gray-100 dark:border-gray-900 ${player.status === "inactive" ? "opacity-50" : ""}`}
                >
                  {editingId === player.id ? (
                    <>
                      <td className="py-2 pr-3 text-gray-400">{player.name}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editForm.first_name}
                          onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editForm.last_name}
                          onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editForm.full_name}
                          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editForm.groupme_user_id}
                          onChange={(e) => setEditForm({ ...editForm, groupme_user_id: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-gray-600 rounded text-sm font-mono focus:outline-none focus:border-blue-500"
                          placeholder="user_id"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="px-2 py-1 bg-transparent border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleSave(player.id)}
                          className="text-green-400 hover:text-green-300 text-xs mr-3"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-500 hover:text-gray-300 text-xs"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-3 font-medium">{player.name}</td>
                      <td className="py-2 pr-3 text-gray-400">{player.first_name || "—"}</td>
                      <td className="py-2 pr-3 text-gray-400">{player.last_name || "—"}</td>
                      <td className="py-2 pr-3 text-gray-400">{player.full_name || "—"}</td>
                      <td className="py-2 pr-3 text-xs">
                        {player.groupme_user_id ? (
                          <>
                            {player.groupme_name && <><span className="text-gray-400">{player.groupme_name}</span><br /></>}
                            <span className="text-gray-600 font-mono">{player.groupme_user_id}</span>
                          </>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${player.status === "active" ? "bg-green-900/30 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                          {player.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-500 text-xs max-w-[200px] truncate">{player.notes || "—"}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => startEdit(player)}
                          className="text-blue-400 hover:text-blue-300 text-xs mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(player.id, player.name)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-600 mt-3">{players.length} players total</p>
        </div>
      )}
    </div>
  );
}
