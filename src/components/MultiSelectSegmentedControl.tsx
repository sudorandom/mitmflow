
interface MultiSelectSegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  values: T[];
  onChange: (values: T[]) => void;
}

const MultiSelectSegmentedControl = <T extends string>({ options, values, onChange }: MultiSelectSegmentedControlProps<T>) => {
  const handleChange = (value: T) => {
    const newValues = values.includes(value)
      ? values.filter(v => v !== value)
      : [...values, value];
    onChange(newValues);
  };

  return (
    <div className="flex items-center rounded-md bg-gray-200 dark:bg-zinc-700 p-1 space-x-1">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => handleChange(option.value)}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            values.includes(option.value)
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

export default MultiSelectSegmentedControl;
