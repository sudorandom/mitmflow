import React, { useState, useMemo } from 'react';

interface HexViewerProps {
  data: Uint8Array;
  bytesPerRow?: number;
}

const HexViewer: React.FC<HexViewerProps> = ({ data, bytesPerRow = 16 }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const rows = useMemo(() => {
    const newRows = [];
    for (let i = 0; i < data.length; i += bytesPerRow) {
      newRows.push({
        offset: i,
        chunk: data.slice(i, i + bytesPerRow),
      });
    }
    return newRows;
  }, [data, bytesPerRow]);

  return (
    <div className="font-mono text-xs bg-zinc-800 p-4 rounded w-full overflow-x-auto">
      <div className="grid grid-cols-[auto_max-content_auto] gap-x-4">
        {/* Header */}
        <div className="text-gray-500 text-right pr-2">Offset</div>
        <div className="text-gray-500">Hexadecimal</div>
        <div className="text-gray-500 pl-2">ASCII</div>

        {/* Rows */}
        {rows.map(({ offset, chunk }) => (
          <React.Fragment key={offset}>
            {/* Offset */}
            <div className="text-right pr-2 text-gray-500">
              {offset.toString(16).padStart(8, '0')}
            </div>

            {/* Hex */}
            <div className="flex items-center">
              {Array.from({ length: bytesPerRow }).map((_, i) => {
                const index = offset + i;
                const byte = i < chunk.length ? chunk[i] : null;
                return (
                  <span
                    key={index}
                    onMouseEnter={() => byte !== null && setHoveredIndex(index)}
                    onMouseLeave={() => byte !== null && setHoveredIndex(null)}
                    className={`px-1 py-0.5 rounded-sm ${
                      hoveredIndex === index ? 'bg-orange-500 text-white' : ''
                    } ${byte === null ? 'text-transparent' : ''}`}
                  >
                    {byte !== null ? byte.toString(16).padStart(2, '0') : '  '}
                  </span>
                );
              })}
            </div>

            {/* ASCII */}
            <div className="flex items-center pl-2">
              {Array.from({ length: bytesPerRow }).map((_, i) => {
                const index = offset + i;
                const byte = i < chunk.length ? chunk[i] : null;
                const char = byte !== null && byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
                return (
                  <span
                    key={index}
                    onMouseEnter={() => byte !== null && setHoveredIndex(index)}
                    onMouseLeave={() => byte !== null && setHoveredIndex(null)}
                    className={`px-0.5 py-0.5 rounded-sm ${
                      hoveredIndex === index ? 'bg-orange-500 text-white' : ''
                    } ${byte === null ? 'text-transparent' : ''}`}
                  >
                    {byte !== null ? char : ' '}
                  </span>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default HexViewer;
