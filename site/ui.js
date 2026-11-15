// Scroll reveals
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }),
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);
document.querySelectorAll(".io").forEach((el) => io.observe(el));

document.getElementById("year").textContent = new Date().getFullYear();

// Contact form: inline validation + AJAX submit to Netlify Forms
const form = document.querySelector("form[name=contact]");
const status = form.querySelector(".form-status");
const button = form.querySelector("button[type=submit]");

const messages = {
  name: "Tell us what to call you.",
  email: "We need a valid email to reply.",
  message: "A sentence or two about the project, please (10+ characters).",
};

function check(input) {
  const field = input.closest(".field");
  const err = field?.querySelector(".err");
  if (!err) return true;
  const ok = input.checkValidity();
  field.classList.toggle("invalid", !ok);
  err.textContent = ok ? "" : messages[input.name] || "Please check this field.";
  return ok;
}

form.querySelectorAll("input[required], textarea[required]").forEach((input) => {
  input.addEventListener("blur", () => check(input));
  input.addEventListener("input", () => input.closest(".field").classList.contains("invalid") && check(input));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const required = [...form.querySelectorAll("input[required], textarea[required]")];
  const valid = required.map(check).every(Boolean);
  if (!valid) {
    required.find((i) => !i.checkValidity())?.focus();
    return;
  }

  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "Sending…";

  try {
    const res = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    form.reset();
    status.textContent = "Thanks — message received. We'll be in touch within two working days.";
  } catch {
    status.classList.add("error");
    status.textContent = "Something went wrong sending that. Please try again or email us directly.";
  } finally {
    button.disabled = false;
  }
});
