'use client';
import { useEffect, useState } from 'react';

interface FilterBarProps {
  selectedTypes: string[];
  onFilterChange: (types: string[]) => void;
}

export default function FilterBar({ selectedTypes, onFilterChange }: FilterBarProps) {
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchServerTypes() {
      try {
        const res = await fetch('/api/server-types');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setAvailableTypes(data.items || []);
      } catch (err) {
        console.error('Server types fetch error:', err);
        setAvailableTypes(['thuyet-minh', 'vietsub']);
      }
      setLoading(false);
    }
    fetchServerTypes();
  }, []);

  const handleToggle = (type: string) => {
    if (selectedTypes.includes(type)) {
      onFilterChange(selectedTypes.filter(t => t !== type));
    } else {
      onFilterChange([...selectedTypes, type]);
    }
  };

  const handleToggleAll = () => {
    if (selectedTypes.length === availableTypes.length) {
      onFilterChange([]);
    } else {
      onFilterChange([...availableTypes]);
    }
  };

  const formatLabel = (type: string) => {
    const labels: Record<string, string> = {
      'thuyet-minh': 'Thuyết minh',
      'vietsub': 'Vietsub',
      'long-tieng': 'Lồng tiếng',
      'engsub': 'Engsub',
    };
    return labels[type] || type;
  };

  if (loading || availableTypes.length === 0) {
    return null;
  }

  const allSelected = selectedTypes.length === availableTypes.length;

  return (
    <div className="filter-bar">
      <div className="filter-label">🎬 Lọc theo phụ đề:</div>
      <div className="filter-options">
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleToggleAll}
            disabled={loading}
          />
          <span>Tất cả</span>
        </label>
        {availableTypes.map(type => (
          <label key={type} className="filter-checkbox">
            <input
              type="checkbox"
              checked={selectedTypes.includes(type)}
              onChange={() => handleToggle(type)}
              disabled={loading}
            />
            <span>{formatLabel(type)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
