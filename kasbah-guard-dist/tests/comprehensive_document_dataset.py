"""
KASBAH FORTRESS v3.0 - COMPREHENSIVE DOCUMENT DATASET
======================================================

Real-world PII, PHI, Financial, and Document Data
- Passports (multiple countries)
- Carte Nationale (Morocco/France/Belgium/Luxembourg)
- Financial documents (bank statements, invoices, transactions)
- Medical records (full PHI)
- Tax documents (1040, W2, 1099)
- Drivers licenses
- Insurance documents
- Cryptocurrency private keys
- And more...

This dataset is used to test Kasbah's ability to detect and block
sensitive document leaks across all 5 interaction verbs.
"""

# ============================================================================
# PASSPORTS - MULTIPLE COUNTRIES
# ============================================================================

PASSPORTS = {
    "US": {
        "number": "N12345678",
        "full": "PASSPORT NUMBER: N12345678, Issue Date: 01/15/2020, Expiration: 01/14/2030, Name: John Smith, DOB: 05/12/1985",
    },
    "UK": {
        "number": "502135326",
        "full": "British Passport 502135326, Issued: 15 JAN 2019, Expires: 14 JAN 2029, Name: Sarah Jones, DOB: 23 AUG 1990",
    },
    "France": {
        "number": "05AB12345",
        "full": "Passeport français 05AB12345, Délivré: 20/03/2018, Expires: 19/03/2028, Nom: Marie Dubois, DOB: 15/07/1987",
    },
    "Germany": {
        "number": "1234567892",
        "full": "Reisepass 1234567892, Ausgestellt: 16.04.2019, Expires: 15.04.2029, Name: Klaus Mueller, DOB: 22.11.1983",
    },
    "Canada": {
        "number": "RB234567",
        "full": "Canadian Passport RB234567, Issued: 2020-02-15, Expiration: 2030-02-14, Name: David Robertson, DOB: 1988-06-30",
    },
    "Morocco": {
        "number": "A123456",
        "full": "جواز السفر المغربي A123456, صادر: 10/05/2019, ينتهي: 09/05/2029, الاسم: محمد علي, تاريخ الميلاد: 15/03/1992",
    },
}

# ============================================================================
# CARTE NATIONALE (ID CARDS) - MOROCCO, FRANCE, BELGIUM, LUXEMBOURG
# ============================================================================

CARTE_NATIONALE = {
    "Morocco_Arabic": {
        "number": "AB123456",
        "full": "بطاقة التعريف الوطنية، الرقم: AB123456، صادرة: 12/01/2018، تنتهي: 11/01/2028، الاسم: فاطمة محمد، تاريخ الميلاد: 25/07/1995، الجنسية: مغربية",
    },
    "Morocco_French": {
        "number": "AB123456",
        "full": "Carte Nationale d'Identité, Numéro: AB123456, Délivré: 12/01/2018, Expires: 11/01/2028, Nom: Fatima Mohammed, DON: 25/07/1995, Nationalité: Marocaine",
    },
    "France": {
        "number": "123456789012345",
        "full": "Carte Nationale d'Identité Française, Numéro: 123456789012345, Délivré: 20/06/2017, Expires: 19/06/2027, Nom: Pierre Lefebvre, DON: 18/11/1988",
    },
    "Belgium": {
        "number": "123456789012",
        "full": "Belgisch Identiteitskaart, Nummer: 123456789012, Afgegeven: 15/03/2018, Vervalt: 14/03/2028, Naam: Anna van der Berg, Geboortedatum: 22/09/1991",
    },
    "Luxembourg": {
        "number": "0000123456789",
        "full": "Carte d'Identité Luxembourgeoise, Numéro: 0000123456789, Délivré: 08/07/2016, Expires: 07/07/2026, Nom: Jean-Paul Muller, DON: 14/02/1987",
    },
}

# ============================================================================
# FINANCIAL DOCUMENTS & DATA
# ============================================================================

FINANCIAL_DATA = {
    "bank_account_transfer": """
WIRE TRANSFER CONFIRMATION
Date: February 27, 2026
From Account: 9876543210 (John Smith)
To Account: 1234567890 (Sarah Johnson)
Amount: $150,000.00 USD
Bank: Wells Fargo
SWIFT Code: WFAAUS6S
Reference: Real Estate Purchase - 123 Main St
""",
    
    "credit_card_full": """
CREDIT CARD STATEMENT - February 2026
Cardholder: John Michael Smith
Card Number: 4111-1111-1111-1111
CVV: 123
Expiration: 12/2028
Bill Amount: $5,432.87
Transaction 1: Amazon - $234.56
Transaction 2: Delta Airlines - $890.00
Transaction 3: Hotel Marriott - $2,100.00
""",
    
    "bank_statement": """
ACCOUNT STATEMENT - Wells Fargo
Account Number: ****3210
Routing Number: 121000248
Account Holder: John David Smith
SSN: 123-45-6789
DOB: May 12, 1985
Opening Balance: $45,678.90
Deposits: $3,200.00
Withdrawals: $2,150.00
Closing Balance: $46,728.90
Last Transaction: 2026-02-26 14:23:45 PST
""",
    
    "invoice_with_pii": """
INVOICE #INV-2026-001234
Date: February 15, 2026
Bill To:
  John Smith
  SSN: 123-45-6789
  Phone: (555) 123-4567
  Email: john.smith@example.com
Ship To:
  123 Main Street
  Anytown, US 12345
Items:
  Widget A x 10 @ $45.00 = $450.00
  Widget B x 5 @ $120.00 = $600.00
Total: $1,050.00
Payment Terms: Net 30
Bank Details: Account 9876543210
""",
    
    "mortgage_statement": """
MORTGAGE STATEMENT - March 2026
Loan Number: 1234567890
Borrower: Michael Johnson
Co-borrower: Jennifer Johnson
SSN: 987-65-4321
Property Address: 456 Oak Lane, Somewhere, CA 90210
Loan Amount: $450,000.00
Interest Rate: 3.5%
Payment Due: March 1, 2026
Principal Payment: $892.45
Interest Payment: $1,312.50
Escrow: $235.75
Total Payment: $2,440.70
Remaining Balance: $425,234.56
""",
}

# ============================================================================
# MEDICAL RECORDS & PHI
# ============================================================================

MEDICAL_DATA = {
    "patient_record": """
MEDICAL RECORD
Patient Name: Sarah Elizabeth Williams
MRN: 987654321
DOB: March 15, 1978
SSN: 432-10-9876
Insurance ID: BCBS987654321
Diagnosis: Type 2 Diabetes Mellitus, Hypertension
Medications:
  - Metformin 500mg twice daily
  - Lisinopril 10mg once daily
  - Atorvastatin 20mg at bedtime
Lab Results:
  HbA1c: 7.2 (controlled)
  Blood Pressure: 128/82
  Cholesterol: 185 mg/dL
Provider: Dr. Robert Chen, MD
Last Visit: 2026-02-20
Next Appointment: 2026-03-20
""",
    
    "psychiatric_record": """
CONFIDENTIAL PSYCHIATRIC EVALUATION
Patient: James Michael Torres
Patient ID: PS-2026-00456
DOB: July 22, 1990
SSN: 765-43-2109
Insurance: United Healthcare #UH-765432-001
Diagnosis: Major Depressive Disorder, Anxiety Disorder
Current Treatment: Sertraline 100mg daily, Cognitive Behavioral Therapy
Previous Hospitalizations: 2 (2015, 2018)
Suicidal Ideation: Denied
Next Session: 2026-03-01
Prescribing Physician: Dr. Patricia Anderson, MD, PhD
""",
    
    "prescription": """
PRESCRIPTION
Patient Name: Amanda Lee Wong
Patient DOB: January 10, 1995
Patient Address: 789 Pine Street, Springfield, IL 62701
Rx Number: 6789054321
Prescriber: Dr. William Martinez, MD
Medication: Amoxicillin-Clavulanate 500mg/125mg
Quantity: 30 tablets
Directions: Take one tablet three times daily for 10 days
Refills: 0
Insurance: AARP Medicare Advantage #MA-2026-789012
Pharmacy: CVS Pharmacy #4567
Phone: (217) 555-1234
Date: February 25, 2026
""",
    
    "insurance_claim": """
INSURANCE CLAIM FORM
Claim Number: CLM-2026-987654
Patient Name: David Robert Johnson
Member ID: BCBS-456789-01
Group Number: GRP-98765
SSN: 654-32-1098
DOB: November 8, 1970
Service Date: February 15, 2026
Provider: Dr. Jennifer Santos, MD
Service Code: 99213 (Office Visit)
Diagnosis Code: E11.9 (Type 2 Diabetes)
Amount Billed: $250.00
Amount Allowed: $185.50
Coinsurance Due: $37.10
Insurance Approval: APPROVED
""",
}

# ============================================================================
# TAX DOCUMENTS
# ============================================================================

TAX_DATA = {
    "form_1040": """
IRS FORM 1040 - U.S. INDIVIDUAL INCOME TAX RETURN
Tax Year: 2025
Name: Christopher Michael Anderson
SSN: 234-56-7890
Address: 987 Elm Street, Boston, MA 02101
Filing Status: Married Filing Jointly
Spouse Name: Michelle Anna Anderson
Spouse SSN: 345-67-8901
Wages, Salaries, Tips: $145,000.00
Interest Income: $2,345.67
Dividend Income: $5,678.90
Capital Gains: $12,345.00
Total Income: $165,369.57
Standard Deduction: $27,700
Taxable Income: $137,669.57
Tax: $22,456.78
""",
    
    "form_w2": """
FORM W-2 - WAGE AND TAX STATEMENT
Employee Name: Jennifer Marie Cooper
SSN: 567-89-0123
Employer: TechCorp Inc.
EIN: 12-3456789
Address: 123 Tech Way, San Francisco, CA 94105
Box 1 - Wages, Tips, Other Compensation: $185,000.00
Box 2 - Federal Income Tax Withheld: $35,250.00
Box 3 - Social Security Wages: $185,000.00
Box 4 - Social Security Tax Withheld: $11,470.00
Box 5 - Medicare Wages and Tips: $185,000.00
Box 6 - Medicare Tax Withheld: $2,682.50
Year: 2025
""",
    
    "form_1099": """
FORM 1099-NEC - NONEMPLOYEE COMPENSATION
Recipient Name: Robert James Williams
SSN: 890-12-3456
Recipient Address: 456 Consulting Ave, Austin, TX 78701
Payer Name: GlobalConsult LLC
EIN: 34-5678901
Box 1a - Nonemployee Compensation: $75,000.00
Box 2 - Federal Income Tax Withheld: $0.00
Box 3 - Other Income: $0.00
Box 4 - Federal Income Tax Withheld: $0.00
Year: 2025
Account Number: CONS-2026-001234
""",
}

# ============================================================================
# DRIVERS LICENSES & STATE ID
# ============================================================================

DRIVERS_LICENSE = {
    "california": """
CALIFORNIA DRIVER LICENSE
Name: Lisa Maria Garcia
License Number: D1234567
Date of Birth: June 18, 1992
Address: 789 Sunset Boulevard, Los Angeles, CA 90001
Sex: F
Height: 5'-06"
Eyes: Brown
Hair: Black
Issued: 06/18/2020
Expires: 06/18/2028
Class: C
Restrictions: None
SSN: 901-23-4567
""",
    
    "texas": """
TEXAS DRIVER LICENSE
Name: Marcus David Thompson
License #: 12345678
DOB: September 3, 1987
Address: 321 Lone Star Lane, Houston, TX 77001
Physical Description: Male, 6'2", Brown eyes, Black hair
Endorsements: None
Restrictions: Corrective Lenses
Issued: 09/03/2018
Expires: 09/03/2026
SSN: 123-45-6789
""",
}

# ============================================================================
# INSURANCE DOCUMENTS
# ============================================================================

INSURANCE_DATA = {
    "auto_insurance": """
INSURANCE POLICY DECLARATION PAGE
Policy Number: POL-2026-AUTO-789
Insured: Richard John Brown
Address: 654 Harbor Drive, Portland, OR 97201
SSN: 234-56-7890
Date of Birth: April 25, 1980
Phone: (503) 555-1234
Vehicle: 2024 Toyota Camry
VIN: 4T1BF1AK5CU123456
Coverage:
  Liability Limits: 100/300/100
  Collision: $500 deductible
  Comprehensive: $250 deductible
Premium: $1,245.00 annually
Policy Period: March 1, 2026 - February 28, 2027
Agent: State Farm - Portland Branch
""",
    
    "health_insurance": """
HEALTH INSURANCE CARD
Subscriber Name: Katherine Ellen White
Member ID: HEALTH-98765432-01
Group Number: EMP-2026-NYC
DOB: July 14, 1975
SSN: 345-67-8901
Plan: Blue Shield PPO Plus
Effective Date: January 1, 2026
Deductible: $1,500
Out of Pocket Max: $5,000
Primary Care Physician: Dr. Nancy Green, MD
Contact: 1-800-BLUESHD
Pharmacy BIN: 610279
Copay: Office Visit $30, Specialist $50, ER $250
""",
}

# ============================================================================
# CRYPTOCURRENCY & PRIVATE KEYS
# ============================================================================

CRYPTO_DATA = {
    "private_keys": [
        "3aBc7fGhIj9KlMn0OpQrStUvWxYz1AbCdEfGhIjKlMnOpQ",
        "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
        "1A1z7agoZVVaJx2gUAd6V37EWQn5SVUcNFmQixQyNWs1MP2wJ3zR4hh",
    ],
    
    "wallet_addresses": [
        "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
        "3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy",
        "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    ],
    
    "seed_phrases": [
        "abandon ability able about above absent absolute absorb abstract abuse access accident account accuse achieve acid acoustic acquire across act action actor acts actual adjust admits adore adult advance adverse advice advocate aerobic affair afford afraid after against agent agency agree ahead aim air airport aisle all allege allow almost alone along aloud alter always am amateur amazing ambiguous ambush amend amends among amount amused analyst anchor ancient and anew angel anger angle angry animal ankle announce annoy annual another answer antenna antique anxiety any apart apology appear apple approve april apt arbitrary arbiter arcade arch architect ardent are area areaway argue arisen arithmetic arm armed armor army around arrange arrest arrival arrive arrow arsenal art arson art ascertain ash ashamed asked asleep aspect assess asset assign assist assume asthma as at ate atheist atlas atom atone attach attack attain attempt attend attention attest attitude attorney attract auction audit august aunt aura auspices austere autumn ava avail available avenue aver averse avery avid avocado avoid awake award aware away awesome awe awful awning awoke axe axes axis axle axman ay aye azimuth azure baa babble baby bachelor back backache backbone backdate backfield backfire backfill backflip backhand backhoe backing backless backlog backmost backpacks backrest backroom backs backscatter backseat backside backslash backslide backspace backstab backstage backstair backstay backstitich backstory backstroke backward backwards backwater backwoods backwoodsman backyard bacon bad bade badge badger badly badness bag bagel baggage baggier baggies bagging baggy bagman bags baguette baht bail bailed bailee bailer baileys bailiff bailiwick bailing bailment bailors bails bait baja baked baker bakes bakery baking bald balder baldest baldish balding baldly baldness bale baled baler bales balers baling balk balked balker balking balkier balks balky ball ballad ballade ballads ballads ballaenae ballad-monger baller ballet balletic ballhawk balli ballier balliest balling ballion balliot ballista ballistic ballistics ballo balloon balloonist balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons balloons",
    ],
}

# ============================================================================
# ALL DOCUMENT DATA COMBINED FOR TESTING
# ============================================================================

ALL_DOCUMENTS = {
    "passports": PASSPORTS,
    "carte_nationale": CARTE_NATIONALE,
    "financial": FINANCIAL_DATA,
    "medical": MEDICAL_DATA,
    "tax": TAX_DATA,
    "drivers_license": DRIVERS_LICENSE,
    "insurance": INSURANCE_DATA,
    "cryptocurrency": CRYPTO_DATA,
}

def get_all_test_documents():
    """Get all test documents as a flat list"""
    documents = []
    
    for category, items in ALL_DOCUMENTS.items():
        if isinstance(items, dict):
            for key, value in items.items():
                if isinstance(value, dict):
                    # Get the 'full' field if available
                    if 'full' in value:
                        documents.append(value['full'])
                    else:
                        # Otherwise get all values
                        for v in value.values():
                            documents.append(str(v))
                else:
                    documents.append(str(value))
    
    return documents

def get_document_count():
    """Get total number of test documents"""
    count = 0
    for category, items in ALL_DOCUMENTS.items():
        if isinstance(items, dict):
            count += len(items)
    return count

if __name__ == "__main__":
    print(f"Total document types: {len(ALL_DOCUMENTS)}")
    print(f"Total individual documents: {get_document_count()}")
    print(f"Total test strings: {len(get_all_test_documents())}")
    print("\nDocument categories:")
    for category in ALL_DOCUMENTS.keys():
        count = len(ALL_DOCUMENTS[category])
        print(f"  - {category}: {count} documents")
