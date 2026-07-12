"use client";
import { cloneElement, useId } from "react";

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
  const control = cloneElement(children, {
    id: children.props.id ?? id,
    "aria-describedby": [children.props["aria-describedby"], hintId].filter(Boolean).join(" ") || undefined,
  });
  return (
    <div className={className} {...rest}>
      <label htmlFor={control.props.id} className="label">{label}</label>
      {control}
      {hint && <p id={hintId} className="text-[12px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
