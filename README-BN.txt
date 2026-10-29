Mini ERP Phase 2C.1 Installer — corrected version

1. Extract this ZIP into the project root:
   D:\Shikol production\MINI ERP project HANDOFF

2. If an old Install-Mini-ERP-Phase2C1.mjs file is already there, replace it with the file in this ZIP.

3. In VS Code PowerShell (from the project root), run:
   node .\Install-Mini-ERP-Phase2C1.mjs

4. Read the preview. Type APPLY only if the project path, branch, and file list are correct.
   If it aborts or shows a different file conflict, do not bypass the guard; share the complete output.

The installer does not run SQL, Supabase commands, npm, Git commits, pushes, or deployments.
It makes backups of existing files it replaces. The inventory migration is only placed in the repository;
it is NOT applied to any database by this installer.


Additional safety note: any existing docs/* file that differs from the installer payload is preserved and skipped, so local documentation edits are not overwritten. Changed source-code files still trigger a protective abort unless a supported structure-checked merge applies.

Additional source safety: the installer merges inventory declarations into the current database.types.ts only when the known master-data structure is present, and adds the InventoryService export to master-data-service.ts only when its expected class/method anchors are present. Any unsupported structure still aborts before writes.
