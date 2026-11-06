import { SANDBOX_TOKEN } from "./sandbox.js";
// A public sentinel, never a production credential. This build cannot accept real keys.
export const getItemAsync=async()=>SANDBOX_TOKEN;
export const setItemAsync=async()=>{};
export const deleteItemAsync=async()=>{};
