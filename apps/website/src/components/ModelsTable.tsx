import { useState, useMemo, useEffect } from 'react';
import type { DisplayModel } from '../interfaces/AppInfo';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from './Drawer';
import { ScrambleText } from './ScrambleText';
import { Tabs } from './Tabs';

type SortDirection = 'asc' | 'desc' | null;
type SortKey = keyof DisplayModel | null;

interface ModelsTableProps {
  models: DisplayModel[];
  filterValue?: string;
  onRowCountChange?: (count: number) => void;
  onProjectCountChange?: (count: number) => void;
}

export function ModelsTable({ models, filterValue = '', onRowCountChange, onProjectCountChange }: ModelsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('project');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedModel, setSelectedModel] = useState<DisplayModel | null>(null);

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!filterValue.trim()) return models;
    const search = filterValue.toLowerCase();
    return models.filter(model =>
      model.project.toLowerCase().includes(search) ||
      model.application.toLowerCase().includes(search)
    );
  }, [models, filterValue]);

  // Sort filtered models
  const sortedModels = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredModels;

    return [...filteredModels].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [filteredModels, sortKey, sortDirection]);

  // Handle column header click for sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };
  
  const getSortDirection = (key: SortKey) => {
    if (sortKey !== key) return undefined;
    return sortDirection || undefined;
  };

  const handleProjectClick = (model: DisplayModel) => {
    setSelectedModel(model);
  };

  const handleDrawerClose = () => {
    setSelectedModel(null);
  }

  // Notify parent of counts
  const rowCount = sortedModels.length;
  const projectCount = new Set(sortedModels.map(m => m.project)).size;

  useEffect(() => {
    onRowCountChange?.(rowCount);
  }, [rowCount, onRowCountChange]);

  useEffect(() => {
    onProjectCountChange?.(projectCount);
  }, [projectCount, onProjectCountChange]);

  const tabs = selectedModel ? [
    {
      label: 'Info',
      content: (
        <div className="space-y-2">
          {Object.entries(selectedModel.links).map(([key, value]) => (
            <div key={key}>
              <span className="font-semibold">{key}: </span>
              <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                {value}
              </a>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: 'Changelog',
      content: (
        <div className="space-y-4">
          {selectedModel.version_history.map((entry, index) => (
            <div key={index}>
              <h3 className="font-semibold">{entry.version} - {entry.release_date}</h3>
              <ul className="list-disc list-inside">
                {entry.commit_log.map((commit, i) => (
                  <li key={i}>{commit.message} - <span className='italic'>{commit.author}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ),
    },
  ] : [];

  return (
    <>
      <table>
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSort('project')} data-sort={getSortDirection('project')}>
              PROJECT
            </th>
            <th className="sortable" onClick={() => handleSort('application')} data-sort={getSortDirection('application')}>
              APPLICATION
            </th>
            <th className="sortable" onClick={() => handleSort('platform')} data-sort={getSortDirection('platform')}>
              PLATFORM
            </th>
            <th className="sortable" onClick={() => handleSort('staging')} data-sort={getSortDirection('staging')}>
              STAGING
            </th>
            <th className="sortable" onClick={() => handleSort('canary')} data-sort={getSortDirection('canary')}>
              CANARY
            </th>
            <th className="sortable" onClick={() => handleSort('production')} data-sort={getSortDirection('production')}>
              PRODUCTION
            </th>
            <th className="sortable" onClick={() => handleSort('status')} data-sort={getSortDirection('status')}>
              STATUS
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedModels.map((model, idx) => (
            <tr key={`${model.project}-${model.application}-${idx}`}>
              <td>
                <span className="provider-name" onClick={() => handleProjectClick(model)}>{model.project}</span>
              </td>
              <td style={{ minWidth: '150px' }}><ScrambleText text={model.application} /></td>
              <td>{model.platform}</td>
              <td>{model.staging}</td>
              <td>{model.canary}</td>
              <td>{model.production}</td>
              <td>{model.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Drawer open={!!selectedModel} onOpenChange={(open) => !open && handleDrawerClose()}>
        <DrawerContent>
          {selectedModel && (
            <>
              <DrawerHeader>
                <DrawerTitle>{selectedModel.project}</DrawerTitle>
                <DrawerDescription>{selectedModel.application}</DrawerDescription>
              </DrawerHeader>
              <DrawerBody>
                <Tabs tabs={tabs} />
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}