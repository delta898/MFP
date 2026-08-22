function bindAccountUpgradeFreeClick() {
  if (accountUpgradeFreeClickBound || typeof document === 'undefined') return;
  accountUpgradeFreeClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-upgrade-free-btn');
    if (!button) return;
    event.preventDefault();
    upgradeAccountToFreePlan().catch((error) => console.warn('[Account Upgrade Free]', error.message));
  });
}

bindAccountUpgradeFreeClick();

let accountEmailClickBound = false;
function bindAccountEmailClick() {
  if (accountEmailClickBound || typeof document === 'undefined') return;
  accountEmailClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-register-email-btn');
    if (!button) return;
    event.preventDefault();
    registerOrChangeAccountEmail().catch((error) => console.warn('[Account Email]', error.message));
  });
}

bindAccountEmailClick();

let accountPlanInfoClickBound = false;
function bindAccountPlanInfoClick() {
  if (accountPlanInfoClickBound || typeof document === 'undefined') return;
  accountPlanInfoClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-plan-info-btn');
    if (!button) return;
    event.preventDefault();
    showAccountPlanInfo().catch((error) => console.warn('[Account Plan Info]', error.message));
  });
}

bindAccountPlanInfoClick();

