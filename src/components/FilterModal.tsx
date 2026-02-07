import React, { useState, useEffect, useRef } from 'react';
import useFilterStore, { FlowType, FLOW_TYPES } from '../store';
import { X } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import Select, { CSSObjectWithLabel } from 'react-select';
import SegmentedControl from './SegmentedControl';
import MultiSelectSegmentedControl from './MultiSelectSegmentedControl';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map(m => ({ value: m, label: m }));

const STATUS_CODE_OPTIONS = [
    { value: '200', label: '200 OK' },
    { value: '201', label: '201 Created' },
    { value: '204', label: '204 No Content' },
    { value: '301', label: '301 Moved Permanently' },
    { value: '302', label: '302 Found' },
    { value: '304', label: '304 Not Modified' },
    { value: '400', label: '400 Bad Request' },
    { value: '401', label: '401 Unauthorized' },
    { value: '403', label: '403 Forbidden' },
    { value: '404', label: '404 Not Found' },
    { value: '500', label: '500 Internal Server Error' },
    { value: '502', label: '502 Bad Gateway' },
    { value: '503', label: '503 Service Unavailable' },
    { value: '504', label: '504 Gateway Timeout' },
    { value: '4xx', label: '4xx Client Error' },
    { value: '5xx', label: '5xx Server Error' },
];

const CONTENT_TYPE_OPTIONS = [
    { value: 'application/json', label: 'application/json' },
    { value: 'application/xml', label: 'application/xml' },
    { value: 'application/js', label: 'application/js' },
    { value: 'text/html', label: 'text/html' },
    { value: 'text/plain', label: 'text/plain' },
    { value: 'image/jpeg', label: 'image/jpeg' },
    { value: 'image/png', label: 'image/png' },
    { value: 'application/octet-stream', label: 'application/octet-stream' },
];

const YES_NO_OPTIONS: { value: 'true' | 'false'; label: string }[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

// Helper to get select value from state
const getStatusValue = (status: boolean | undefined): 'true' | 'false' | undefined => {
    if (status === true) return 'true';
    if (status === false) return 'false';
    return undefined;
};

// Helper to set state from select value
const setStatusFromValue = (value: 'true' | 'false' | undefined): boolean | undefined => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
};


const FilterRow = ({ label, children, isEven }: { label: string, children: React.ReactNode, isEven: boolean }) => (
  <div className={`flex items-center justify-between p-3 px-4 gap-4 ${isEven ? 'bg-gray-100 dark:bg-zinc-900' : 'bg-white dark:bg-zinc-800'}`}>
    <div className="font-medium text-sm text-gray-700 dark:text-zinc-300 w-1/3 flex-shrink-0">{label}</div>
    <div className="flex-grow w-2/3 min-w-0">{children}</div>
  </div>
);

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  uniqueClientIps: string[];
}

const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, uniqueClientIps = [] }) => {
  const store = useFilterStore();

  // Local state for all filters
  const [pinned, setPinned] = useState(store.pinned);
  const [hasNote, setHasNote] = useState(store.hasNote);
  const [flowTypes, setFlowTypes] = useState<FlowType[]>(store.flowTypes);
  const [clientIps, setClientIps] = useState<string[]>(store.clientIps);
  const [methods, setMethods] = useState<string[]>(store.http.methods);
  const [statusCodes, setStatusCodes] = useState<string[]>(store.http.statusCodes);
  const [contentTypes, setContentTypes] = useState<string[]>(store.http.contentTypes);

  const modalRef = useRef<HTMLDivElement>(null);

  // Sync local state with store when modal opens
  useEffect(() => {
    if (isOpen) {
      setPinned(store.pinned);
      setHasNote(store.hasNote);
      setFlowTypes(store.flowTypes);
      setClientIps(store.clientIps);
      setMethods(store.http.methods);
      setStatusCodes(store.http.statusCodes);
      setContentTypes(store.http.contentTypes);
    }
  }, [isOpen]);

  // Only close on Escape if modal is open and focused
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => { modalRef.current?.focus(); }, 0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleApply = () => {
    store.setPinned(pinned);
    store.setHasNote(hasNote);
    store.setFlowTypes(flowTypes);
    store.setClientIps(clientIps);
    store.setHttpMethods(methods);
    store.setHttpStatusCodes(statusCodes);
    store.setHttpContentTypes(contentTypes);
    onClose();
  };

  const handleClearAll = () => {
    setPinned(undefined);
    setHasNote(undefined);
    setFlowTypes([]);
    setClientIps([]);
    setMethods([]);
    setStatusCodes([]);
    setContentTypes([]);
  };

  // Filter out HTTP-specific options if HTTP is not selected (if flowTypes.length > 0)
  const showHttpFilters = flowTypes.length === 0 || flowTypes.includes('http');

  let rowIndex = 0;

  const selectStyles = {
    menuPortal: (base: CSSObjectWithLabel) => ({ ...base, zIndex: 9999 })
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div
        ref={modalRef}
        tabIndex={0}
        className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-2xl text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700 flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-zinc-700">
          <h2 className="text-xl font-semibold">Advanced Filters</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto">
            {/* Flow Type */}
            <FilterRow label="Flow Type" isEven={rowIndex++ % 2 !== 0}>
                <MultiSelectSegmentedControl
                    options={FLOW_TYPES}
                    values={flowTypes}
                    onChange={setFlowTypes}
                />
            </FilterRow>

            {/* Pinned Filter */}
            <FilterRow label="Pinned" isEven={rowIndex++ % 2 !== 0}>
                <SegmentedControl
                    options={YES_NO_OPTIONS}
                    value={getStatusValue(pinned)}
                    onChange={(selected) => setPinned(setStatusFromValue(selected))}
                />
            </FilterRow>

            {/* Note Filter */}
            <FilterRow label="Note" isEven={rowIndex++ % 2 !== 0}>
                <SegmentedControl
                    options={YES_NO_OPTIONS}
                    value={getStatusValue(hasNote)}
                    onChange={(selected) => setHasNote(setStatusFromValue(selected))}
                />
            </FilterRow>

            {/* Client IP */}
            <FilterRow label="Client IP" isEven={rowIndex++ % 2 !== 0}>
                <Select
                    isMulti
                    options={uniqueClientIps.map(ip => ({ value: ip, label: ip }))}
                    value={uniqueClientIps.filter(ip => clientIps.includes(ip)).map(ip => ({ value: ip, label: ip }))}
                    onChange={(selected) => setClientIps(selected.map(s => s.value))}
                    className="text-black text-sm"
                    placeholder="Select IPs..."
                    menuPortalTarget={document.body}
                    styles={selectStyles}
                />
            </FilterRow>

            {showHttpFilters && (
                <>
                    {/* HTTP Method */}
                    <FilterRow label="HTTP Method" isEven={rowIndex++ % 2 !== 0}>
                        <CreatableSelect
                            isMulti
                            options={HTTP_METHODS}
                            value={HTTP_METHODS.filter(m => methods.includes(m.value))}
                            onChange={(selected) => setMethods(selected.map(s => s.value))}
                            className="text-black text-sm"
                            placeholder="Select methods..."
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </FilterRow>

                    {/* HTTP Status Code */}
                    <FilterRow label="HTTP Status Code" isEven={rowIndex++ % 2 !== 0}>
                        <CreatableSelect
                            isMulti
                            options={STATUS_CODE_OPTIONS}
                            value={statusCodes.map(sc => ({ value: sc, label: sc }))}
                            onChange={(selected) => setStatusCodes(selected.map(s => s.value))}
                            className="text-black text-sm"
                            placeholder="e.g., 200, 4xx, 500-599"
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </FilterRow>

                    {/* HTTP Content Type */}
                    <FilterRow label="HTTP Content Type" isEven={rowIndex++ % 2 !== 0}>
                        <CreatableSelect
                            isMulti
                            options={CONTENT_TYPE_OPTIONS}
                            value={contentTypes.map(ct => ({ value: ct, label: ct }))}
                            onChange={(selected) => setContentTypes(selected.map(s => s.value))}
                            className="text-black text-sm"
                            placeholder="e.g., application/json, text/html"
                            menuPortalTarget={document.body}
                            styles={selectStyles}
                        />
                    </FilterRow>
                </>
            )}
        </div>

        {/* --- Actions --- */}
        <div className="flex justify-end items-center p-4 border-t border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 rounded-b-lg">
          <button
            onClick={handleClearAll}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors text-sm"
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md ml-2 transition-colors text-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FilterModal);
