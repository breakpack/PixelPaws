import { useEffect, useState } from "react";
import { api } from "./lib/api";

export default function App() {
  const [deviceId, setDeviceId] = useState("");
  const [visible, setVisible] = useState(false);
  const [cats, setCats] = useState<{ id: string; version: string }[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();

  useEffect(() => {
    api.get("/v1/cats").then(({ data }) => setCats(data));
  }, []);

  const load = async () => {
    const { data } = await api.get(`/v1/devices/${deviceId}/state`);
    setVisible(data.visible);
    setSelectedCatId(data.selectedCatId || undefined);
  };
  const save = async () => {
    await api.patch(`/v1/devices/${deviceId}/state`, {
      visible,
      selectedCatId: selectedCatId || null,
    });
    await load();
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>PixelPaws Control</h2>
      <input
        placeholder="Device ID"
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
        style={{ width: 320 }}
      />
      <button onClick={load} disabled={!deviceId} style={{ marginLeft: 8 }}>
        Load
      </button>
      <div style={{ marginTop: 12 }}>
        <label>
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span style={{ marginLeft: 8 }}>Visible</span>
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <select
          value={selectedCatId || ""}
          onChange={(e) => setSelectedCatId(e.target.value || undefined)}
        >
          <option value="">(none)</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} (v{c.version})
            </option>
          ))}
        </select>
      </div>
      <button style={{ marginTop: 12 }} onClick={save} disabled={!deviceId}>
        Save
      </button>
    </div>
  );
}
