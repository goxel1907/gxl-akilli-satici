# Nested Etsy tabs and listing workflow QA

## Changes

The Etsy workspace, Trend groups and Studio modes stay mounted while navigating between tabs. Network loads are gated by the active section. Query text, discovery filters and form edits survive navigation; switching modes invalidates pending seed requests so a late response cannot switch the seller back to another mode.

Every scanned Trend card offers a targeted rescan. Manual scans request refresh while respecting the server's refresh floor. Discovery details older than a newer server summary are not preferred over it. Seasonal scans send their declared group and use the same minimum-sample ranking rule as the main Trend section.

Digital-product and seller-written-pattern cards transfer their selected search and kind into Studio. Physical Trend groups offer the seller's own-photo workflow and do not generate crochet/printable seeds or copy competitor attributes into physical-product facts.

Seller-written pattern plans are bound to their current inputs. Editing product identity clears the previous competitor price and ownership/testing confirmations; the old listing cannot be uploaded as the new product. An unavailable product-specific price must be entered or researched again rather than inherited from another product.

A successfully prepared printable package is saved as the latest workspace on the phone. **Son çalışmayı aç** restores its original inputs, selected assistant, generated listing, price, prompts and handoff ID. It does not regenerate a differently named product. The saved record is versioned and validated before restoration. It stores one completed package, not every unsaved edit or the assistant's binary files. Files must still be downloaded and selected from the phone. Stored handoff expiration and the age of the saved research still apply.

## Screen scenarios

Tests render the actual `App.tsx` components with React and replace only the native/Expo boundaries. They exercise buttons and text fields rather than matching source-code strings:

- Trend search survives Studio/Digital/main-navigation visits.
- Pending seed cannot undo a physical-mode choice.
- Printable form edits survive Studio-mode switches.
- Actual main navigation preserves the Etsy workspace.
- Discovery filters survive nested-tab changes.
- Digital products, hobbies, prayer beads and vintage groups expose matching actions.
- Season scans preserve group and reject tiny-sample winners.
- Editing a seller-written pattern invalidates old text, confirmations and price.
- A discovered result can be rescanned in place.
- Search → Studio preparation → complete assistant share payload → saved-workspace close/reopen → Digital prefill → PDF/image selection → staged uploads → actual Worker storage → Etsy draft → draft/active state confirmation.
- Physical Trend selection opens the photo workflow without pattern generation.
- A late preparation response cannot replace an explicitly resumed workspace.

The full screen flow asserts unchanged title, description, tags and price and verifies that two PDFs and one image reach the draft. A separate state change simulates the seller's Etsy-side publication; no publish request is sent. Workspace parser tests cover retained identity and invalid/incompatible records.

## Validation and limits

229 tests pass, including the 12 screen scenarios and two workspace tests. Root/mobile TypeScript checks, Android Expo export and Worker dry-run pass. Test dependencies are development-only; the mobile native dependency list and runtime version are unchanged.

React Native hosts, AsyncStorage, file pickers, the URI-to-multipart native transport, linking/sharing and Etsy responses are controlled substitutes. This is not an Android device test, visual layout approval, actual assistant-file production, real product-content QA, or a live Etsy publication. The screen flow uses parseable PDF fixtures and a repository PNG only to exercise upload mechanics. No live listing, customer message or pin is created.
