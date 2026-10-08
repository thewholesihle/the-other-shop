// The signed-in admin's CSRF token, shared with code that can't go through the patched fetch (XMLHttpRequest, which is
// what gives a file upload a progress bar). Admin.svelte sets it on sign-in and clears it on sign-out.
let token = '';
export const setCsrf = (t) => { token = t || ''; };
export const getCsrf = () => token;
