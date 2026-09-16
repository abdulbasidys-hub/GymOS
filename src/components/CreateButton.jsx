import { IconPlus } from "./NavIcons";

// "Add a receptionist", "New gym", "Add a marketer" — the one button on a
// list page that creates the thing the page lists.
//
// On a desktop it is an ordinary labelled button in the card's heading row.
// On a phone the words are dropped and what's left is a round accent button
// floating above the tab bar, which is where a phone puts "create the main
// thing" — the same treatment the front desk's "Register a new member"
// already gets. The label stays as the accessible name, so the button is
// still announced properly when the text is hidden.
export default function CreateButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      className="btn btn--primary btn--inline create-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <IconPlus />
      <span className="create-btn__label">{label}</span>
    </button>
  );
}
