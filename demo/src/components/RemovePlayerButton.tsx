import * as React from "react";

export default React.memo(function RemovePlayerButton({
  onClick,
}: {
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button className="remove-player white-button" onClick={onClick}>
      {"Close X"}
    </button>
  );
});
