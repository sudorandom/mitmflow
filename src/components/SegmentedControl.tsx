
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | undefined; // Allow undefined for no selection
  onChange: (value: T | undefined) => void;
}

const SegmentedControl = <T extends string>({ options, value, onChange }: SegmentedControlProps<T>) => {
  const handleChange = (newValue: T) => {
    if (value === newValue) {
      onChange(undefined); // Unselect if the same value is clicked again
    } else {
      onChange(newValue);
    }
  };

  return (
    <div className="flex items-center rounded-md bg-gray-200 dark:bg-zinc-700 p-1 space-x-1">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => handleChange(option.value)}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            value === option.value
              ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-300 dark:hover:bg-zinc-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default SegmentedControl;
