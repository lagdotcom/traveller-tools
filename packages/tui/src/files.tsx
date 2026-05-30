import React, { createContext, useContext } from 'react';

/**
 * Platform file access for importing a ship, injected by the entry point so the
 * TUI stays I/O-free. The terminal supplies `readFile` (read a path off disk);
 * the browser supplies `pickFile` (a native file dialog). Either may be absent.
 */
export interface FileCapabilities {
  /** Open a native picker and resolve with the chosen file's text (or null). */
  pickFile?: () => Promise<string | null>;
  /** Read a file by path, returning its text (or null if it can't be read). */
  readFile?: (path: string) => string | null;
}

const FilesContext = createContext<FileCapabilities>({});

export function FilesProvider({
  files,
  children,
}: {
  files: FileCapabilities;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <FilesContext.Provider value={files}>{children}</FilesContext.Provider>
  );
}

export const useFiles = (): FileCapabilities => useContext(FilesContext);
