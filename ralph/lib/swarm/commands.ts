/**
 * Build a pane command that preserves the wrapped command's exit code, leaves
 * a visible completion marker, and then closes the tmux pane after a delay.
 */
export function buildAutoCloseCommand(command: string, timeoutSeconds: number): string {
	return `(${command}); __omnidev_exit_code=$?; echo "[finished]"; __omnidev_pane_id="$(tmux display-message -p '#{pane_id}' 2>/dev/null || true)"; sleep ${timeoutSeconds}; if [ -n "$__omnidev_pane_id" ]; then tmux kill-pane -t "$__omnidev_pane_id" 2>/dev/null || true; fi; exit $__omnidev_exit_code`;
}
