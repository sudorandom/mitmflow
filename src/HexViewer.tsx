import React, { useState, useMemo } from 'react';

interface HexViewerProps {
  data: Uint8Array;
  bytesPerRow?: number;
}

const HexViewer: React.FC<HexViewerProps> = ({ data, bytesPerRow = 16 }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const rowsPerPage = 32; // You can adjust this for more/less rows per page

  const totalRows = useMemo(() => Math.ceil(data.length / bytesPerRow), [data.length, bytesPerRow]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalRows / rowsPerPage)), [totalRows, rowsPerPage]);

  const pagedRows = useMemo(() => {
    const newRows = [];
    const startRow = page * rowsPerPage;
    const endRow = Math.min(totalRows, startRow + rowsPerPage);
    for (let row = startRow; row < endRow; row++) {
      const offset = row * bytesPerRow;
      newRows.push({
        offset,
        chunk: data.slice(offset, offset + bytesPerRow),
      });
    }
    return newRows;
  }, [data, bytesPerRow, page, rowsPerPage, totalRows]);

  const handlePrev = () => setPage((p) => Math.max(0, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  return (
    <div className="font-mono text-xs bg-gray-100 dark:bg-zinc-800 p-4 rounded w-full overflow-x-auto text-gray-900 dark:text-zinc-300">
      <div className="flex flex-col items-center mb-2">
        <div className="flex gap-4 items-center">
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-200 disabled:opacity-50"
            onClick={handlePrev}
            disabled={page === 0}
          >
            Prev
          </button>
          <span className="text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-200 disabled:opacity-50"
            onClick={handleNext}
            disabled={page === totalPages - 1}
          >
            Next
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[auto_max-content_auto] gap-x-4">
        {/* Header */}
        <div className="text-gray-500 dark:text-gray-400 text-right pr-2">Offset</div>
        <div className="text-gray-500 dark:text-gray-400">Hexadecimal</div>
        <div className="text-gray-500 dark:text-gray-400 pl-2">ASCII</div>

        {/* Rows */}
        {pagedRows.map(({ offset, chunk }) => (
          <React.Fragment key={offset}>
            {/* Offset */}
            <div className="text-right pr-2 text-gray-500 dark:text-gray-400">
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
