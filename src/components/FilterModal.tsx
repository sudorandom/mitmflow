import React from 'react';
import useFilterStore, { FlowType } from '../store';
import { X } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';

const FLOW_TYPES: { id: FlowType; label: string }[] = [
  { id: 'http', label: 'HTTP' },
  { id: 'dns', label: 'DNS' },
  { id: 'tcp', label: 'TCP' },
  { id: 'udp', label: 'UDP' },
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

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
    { value: 'text/html', label: 'text/html' },
    { value: 'text/plain', label: 'text/plain' },
    { value: 'image/jpeg', label: 'image/jpeg' },
    { value: 'image/png', label: 'image/png' },
    { value: 'application/octet-stream', label: 'application/octet-stream' },
];

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose }) => {
  const {
    flowTypes,
    setFlowTypes,
    http: { methods, contentTypes, statusCodes, setMethods, setContentTypes, setStatusCodes },
    clearFilters,
  } = useFilterStore();

  const handleFlowTypeChange = (type: FlowType) => {
    const newFlowTypes = flowTypes.includes(type)
      ? flowTypes.filter((t) => t !== type)
      : [...flowTypes, type];
    setFlowTypes(newFlowTypes);
  };

  const handleHttpMethodChange = (method: string) => {
    const newMethods = methods.includes(method)
      ? methods.filter((m) => m !== method)
      : [...methods, method];
    setMethods(newMethods);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-2xl text-white">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Advanced Filters</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* --- Filters --- */}
        <div className="space-y-6">
          {/* Flow Type Filter */}
          <div>
            <h3 className="text-lg font-medium mb-2">Flow Type</h3>
            <div className="flex flex-wrap gap-2">
              {FLOW_TYPES.map(({ id, label }) => (
                <label key={id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flowTypes.includes(id)}
                    onChange={() => handleFlowTypeChange(id)}
                    className="form-checkbox h-5 w-5 rounded bg-zinc-700 border-zinc-600 text-orange-500 focus:ring-orange-500"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Conditional HTTP Filters */}
          {(flowTypes.length === 0 || flowTypes.includes('http')) && (
            <>
              {/* HTTP Method Filter */}
              <div>
                <h3 className="text-lg font-medium mb-2">HTTP Method</h3>
                <div className="flex flex-wrap gap-2">
                  {HTTP_METHODS.map((method) => (
                    <label key={method} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={methods.includes(method)}
                        onChange={() => handleHttpMethodChange(method)}
                        className="form-checkbox h-5 w-5 rounded bg-zinc-700 border-zinc-600 text-orange-500 focus:ring-orange-500"
                      />
                      <span>{method}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* HTTP Status Code Filter */}
              <div>
                <h3 className="text-lg font-medium mb-2">HTTP Status Code</h3>
                <CreatableSelect
                    isMulti
                    options={STATUS_CODE_OPTIONS}
                    value={statusCodes.map(sc => ({ value: sc, label: sc }))}
                    onChange={(selected) => setStatusCodes(selected.map(s => s.value))}
                    className="text-black"
                    placeholder="e.g., 200, 4xx, 500-599"
                />
              </div>

              {/* HTTP Content Type Filter */}
              <div>
                <h3 className="text-lg font-medium mb-2">HTTP Content Type</h3>
                <CreatableSelect
                    isMulti
                    options={CONTENT_TYPE_OPTIONS}
                    value={contentTypes.map(ct => ({ value: ct, label: ct }))}
                    onChange={(selected) => setContentTypes(selected.map(s => s.value))}
                    className="text-black"
                    placeholder="e.g., application/json, text/html"
                />
              </div>
            </>
          )}
        </div>

        {/* --- Actions --- */}
        <div className="flex justify-end items-center mt-6 pt-4 border-t border-zinc-700">
          <button
            onClick={() => {
              clearFilters();
              onClose();
            }}
            className="text-zinc-400 hover:text-white px-4 py-2 rounded-md"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md ml-2"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterModal;
