"use client";
import { cloneElement, isValidElement, useId } from "react";

// A labelled form field. Renders exactly the markup the forms already use —
// a `.label` caption above a `.input` control inside a wrapper div — but wires
// htmlFor/id so the label is programmatically associated with the control
// (WCAG 1.3.1 / 3.3.2 / 4.1.2). The control keeps its own accessible name, and
// clicking the caption focuses it. Layout is unchanged: same classes, same DOM.
//
//   <Field label="Date"><input type="date" className="input" .../></Field>
//
// `hint` renders optional helper text below the control, also associated via
// aria-describedby. Extra props (e.g. className) go on the wrapper div.
export default function Field({ label, hint, children, className, ...rest }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  // Clone only a single element child (the control). If a caller ever passes
  // something else (e.g. two children, or a falsy child), render it as-is
  // rather than reading .props off an array/undefined — a form field must never
  // crash the whole tab. The label just loses its htmlFor association.
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        "aria-describedby": [children.props["aria-describedby"], hintId].filter(Boolean).join(" ") || undefined,
      })
    : children;
  const controlId = isValidElement(control) ? control.props.id : undefined;
  return (
    // min-w-0 so a Field used as a flex/grid child can shrink below its
    // content's intrinsic width — otherwise a date/number/select control forces
    // the cell wide and the row overflows the card on a narrow phone.
    <div className={`min-w-0 ${className || ""}`} {...rest}>
      <label htmlFor={controlId} className="label">{label}</label>
      {control}
      {hint && <p id={hintId} className="text-[12px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
