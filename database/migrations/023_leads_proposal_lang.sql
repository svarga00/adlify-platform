-- Pridať proposal_lang stĺpec do leads tabuľky.
-- Sk/cs/de/en/hu — jazyk v ktorom sa generuje AI analýza, KW návrhy, ponuka.
-- User vyberá pri vytvorení leadu z dropdownu. Default 'sk'.

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS proposal_lang TEXT DEFAULT 'sk';

COMMENT ON COLUMN leads.proposal_lang IS
'Pracovný jazyk leadu (sk/cs/de/en/hu). Používa sa pre AI analýzu, KW návrhy v MM Reporty tabe, generovanie ponuky a komunikáciu. User nastavuje pri vytvorení leadu, dá sa kedykoľvek zmeniť v "Upraviť údaje leadu".';

-- Existujúce leady ostanú s default 'sk' (NULL → 'sk' cez DEFAULT).
UPDATE leads SET proposal_lang = 'sk' WHERE proposal_lang IS NULL;
