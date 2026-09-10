import React from 'react';
import { Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { currentDate, user } = useApp();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
      <h2 className="text-base font-semibold text-gray-800 flex-1">{title}</h2>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded px-2.5 py-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-medium">{currentDate}</span>
        </div>

        <div className="flex items-center gap-1.5 pl-3 border-l border-gray-200">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <span className="text-xs font-medium text-gray-700">{user?.name || 'Administrator'}</span>
        </div>
      </div>
    </header>
  );
}
