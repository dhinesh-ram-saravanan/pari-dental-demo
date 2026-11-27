export const MARKS = { decay: 'Decay', filled: 'Filled', rct: 'Root canal', crown: 'Crown', implant: 'Implant', missing: 'Missing' };
export const MED = ['Blood Pressure', 'Asthma/Breathing Problems', 'Hormonal Problems', 'Diabetes', 'Liver disease', 'Bleeding Disorders', 'Heart Problems', 'Kidney disease', 'Digestive Problem'];
export const RX = ['Amoxicillin 500mg, three times a day, 5 days', 'Paracetamol 650mg when needed for pain', 'Ibuprofen 400mg, three times a day, 3 days', 'Metronidazole 400mg, three times a day, 5 days', 'Chlorhexidine mouthwash, twice a day, 7 days', 'Sensitivity toothpaste, twice a day'];
export const SLOTS = (() => { const a = []; for (let h = 9; h < 21; h++) for (const m of ['00', '30']) a.push(String(h).padStart(2, '0') + ':' + m); return a; })();
export const EXP_CATS = ['Equipment', 'Consumables', 'Rent', 'Salary', 'Utilities', 'Lab', 'Maintenance', 'Other'];
export const INV_CATS = ['Anaesthetic', 'Restorative', 'Endodontic', 'Orthodontic', 'Disposables', 'Instruments', 'Medicines', 'Other'];
export const NEXTS = [['', 'None'], ['3', '3 days'], ['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['180', '6 months']];
export const ROLES = ['Doctor', 'Junior doctor', 'Assistant', 'Front of house'];
export const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Baby'];
export const XCOLS = ['Reg No.', 'Date', 'Name', 'Treatment', 'Mobile Number', 'Address', 'Age', 'Sex', 'DOB'];
export const DOCTOR = 'Dr. Narasimman';
export const COMPLAINTS = ['Tooth pain', 'Sensitivity', 'Bleeding gums', 'Broken tooth', 'Cleaning', 'Missing teeth', 'Wisdom tooth pain', 'Braces / crooked teeth', 'Check-up'];
export const RELATIONS = ['Husband', 'Wife', 'Mother', 'Father', 'Son', 'Daughter', 'Brother', 'Sister', 'Friend'];
// Quick picks that must not be given with a known allergy: [what the allergy note mentions, which medicines]
export const ALLERGY_CLASH = [[/penicillin|amox/i, /amoxicillin|penicillin|augmentin/i], [/nsaid|ibuprofen|brufen|aspirin/i, /ibuprofen|aspirin|diclofenac/i], [/metronidazole|flagyl/i, /metronidazole/i], [/paracetamol|crocin|dolo/i, /paracetamol/i]];
export const DECL = 'I understand the need for these questions to be answered truthfully. To the best of my knowledge, the answers I have given are accurate. I also understand it is very important to report any changes or updates in my medical status. I give permission to obtain from my physician any additional information regarding my medical history needed to provide me with the best treatment possible.';
