// Holder wired up by <ConfirmDialog> (mounted once in Admin.svelte). Replaces the
// native window.confirm() with a styled, promise-based dialog:
//   if (!(await confirmDialog.ask({ title: 'Delete order?', destructive: true }))) return;
export const confirmDialog = {
  ask: async () => window.confirm('Are you sure?'), // fallback until the dialog mounts
};
