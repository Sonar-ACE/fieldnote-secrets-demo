"use strict";

const form = document.querySelector("#login-form");
const result = document.querySelector("#result");
const loginView = document.querySelector("#login-view");
const accountView = document.querySelector("#account-view");
const accountEmail = document.querySelector("#account-email");
const accountResult = document.querySelector("#account-result");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const submitButton = form.querySelector("button[type='submit']");

function showAccount(email) {
  accountEmail.textContent = email;
  result.textContent = "";
  accountResult.textContent = "";
  loginView.hidden = true;
  accountView.hidden = false;
  document.title = "Fieldnote | Signed in";
}

function showLogin() {
  accountResult.textContent = "";
  accountView.hidden = true;
  loginView.hidden = false;
  document.title = "Fieldnote | Sign in";
}

async function loadSession() {
  try {
    const response = await fetch("/api/session");
    if (response.ok) {
      const account = await response.json();
      if (account.authenticated) {
        showAccount(account.email);
      }
    }
  } catch {
    result.textContent = "The local demo server is unavailable.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.textContent = "Checking your sign-in...";
  submitButton.disabled = true;

  const formData = new FormData(form);
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      result.textContent = body.message;
      return;
    }
    form.reset();
    result.textContent = "";
    showAccount(body.email);
  } catch {
    result.textContent = "The local demo server is unavailable.";
  } finally {
    submitButton.disabled = false;
  }
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.textContent = showPassword ? "Hide" : "Show";
  passwordToggle.setAttribute("aria-pressed", String(showPassword));
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  const button = document.querySelector("#logout-button");
  button.disabled = true;
  try {
    const response = await fetch("/api/logout", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      accountResult.textContent = body.message;
      return;
    }
    accountResult.textContent = body.message;
    showLogin();
    result.textContent = body.message;
  } catch {
    accountResult.textContent = "The local demo server is unavailable.";
  } finally {
    button.disabled = false;
  }
});

loadSession();