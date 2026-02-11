import { useState, useEffect } from 'react';
import { ModelsTable } from './ModelsTable';
import type { DisplayModel } from '../interfaces/AppInfo';

interface ModelsTableWithSearchProps {
  models: DisplayModel[];
}

export function ModelsTableWithSearch({ models }: ModelsTableWithSearchProps) {
  const [searchValue, setSearchValue] = useState('');
  const [rowCount, setRowCount] = useState(models.length);
  const [projectCount, setProjectCount] = useState(
    new Set(models.map((m) => m.project)).size
  );

  // Inject search bar into navbar (only once on mount)
  useEffect(() => {
    const navbarSearch = document.getElementById('navbar-search');

    if (navbarSearch && !navbarSearch.querySelector('input')) {
      // Create wrapper for input and keyboard hint
      const wrapper = document.createElement('div');
      wrapper.className = 'relative inline-flex items-center';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Filter';
      searchInput.className = 'w-28 md:w-48 px-2 md:px-3 py-1.5 pr-12 text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-600';
      searchInput.addEventListener('input', (e) => {
        setSearchValue((e.target as HTMLInputElement).value);
      });

      // Create keyboard shortcut hint
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const shortcutHint = document.createElement('kbd');
      shortcutHint.className = 'hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none items-center gap-0.5';

      // Create cmd/ctrl symbol
      const cmdIcon = document.createElement('span');
      cmdIcon.textContent = isMac ? '⌘' : 'Ctrl';
      shortcutHint.appendChild(cmdIcon);

      // Create K
      const kText = document.createElement('span');
      kText.textContent = 'K';
      shortcutHint.appendChild(kText);

      wrapper.appendChild(searchInput);
      wrapper.appendChild(shortcutHint);
      navbarSearch.appendChild(wrapper);

      // Add Cmd+K / Ctrl+K keyboard shortcut
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          searchInput.focus();
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // Cleanup
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  // Update model count in navbar
  useEffect(() => {
    const navbarModelCount = document.getElementById('navbar-model-count');
    if (navbarModelCount) {
      navbarModelCount.textContent = rowCount.toString();
    }
  }, [rowCount]);

  // Update project count in navbar
  useEffect(() => {
    const navbarProjectCount = document.getElementById('navbar-project-count');
    if (navbarProjectCount) {
      navbarProjectCount.textContent = projectCount.toString();
    }
  }, [projectCount]);

  return (
    <div className="table-container">
      <ModelsTable
        models={models}
        filterValue={searchValue}
        onRowCountChange={setRowCount}
        onProjectCountChange={setProjectCount}
      />
    </div>
  );
}