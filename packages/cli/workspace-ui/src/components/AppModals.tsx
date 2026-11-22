import { LogoMark } from "../Icons";
import type { WorkspaceStatus } from "../types";
import { Modal } from "./Ui";

export function AboutModal({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: WorkspaceStatus | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="About this workspace" width={520} className="about-modal">
      <div className="about-body">
        <div className="about-mark">
          <LogoMark size={28} />
          <div>
            <b>Congo workspace</b>
            <span>Version {status?.version ?? "0.1.0"} · runs on this computer</span>
          </div>
        </div>
        <p>
          Browse apps and screens in Explore or compare directions in Canvas. Use Congo to build
          or redesign, and Congo Compete to research product ideas.
        </p>
        <p className="about-fine">
          Inter by Rasmus Andersson (SIL Open Font License 1.1). Dependency notices ship with
          the workspace source.
        </p>
      </div>
    </Modal>
  );
}
