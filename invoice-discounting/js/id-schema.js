/* GENERATED from "PSBPlatform Xchange_Sourcing_Partner_Integration_API_Documentation_Schema_v1.1.xlsx" (API version 1.1, 2024-05-20).
   Do not hand-edit: re-run the extractor. Field rows, mandatory flags and validation text are verbatim from the sheet. */
const PSB_SCHEMA = {
 "leadApi": {
  "request": [
   {
    "name": "Fintech PSB Platform ID",
    "path": "",
    "key": "fintechpsbplatformid",
    "desc": "Sourcing Partner to provide the PSB Platform ID for itself",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This should be a valid PSB Platform ID for a Sourcing Partner onboarded onto the PSB Platform Xchange. Corresponding product code to be active for this Sourcing Partner (Sourcing Partner to be in Active State on the Platfrom). The PSB Platform ID tagged should also be valid."
   },
   {
    "name": "Lead Type",
    "path": "leaddetails",
    "key": "leadtyp",
    "desc": "Possible list of Values:\nFor Channel Partner Lead = CPL\nFor Program Lead = PGL",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lead Onboarding mode",
    "path": "leaddetails",
    "key": "leadonboardingtype",
    "desc": "There can be two types of Lead Onboarding Mode:\nSelf : In case the Lead is going to complete the onboarding journey itself.\nAssisted: In case the Lead is going to have a Sourcing Partner Assisted journey",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nShould be restricted to the values provided in Dropdown"
   },
   {
    "name": "Sourcing Partner Lead ID",
    "path": "leaddetails",
    "key": "sourcingpartnerleadid",
    "desc": "This is the unique identifier for the Lead available at Sourcing Partners end.",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values: This can include alphanumeric values with any special characters to be allowed as well."
   },
   {
    "name": "Product Code",
    "path": "leaddetails",
    "key": "productcode",
    "desc": "This is used to provide the product code details",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "If leadtype = PGL, then\nproductcode = DF or VF or SID or PID or  FACT or REVFACT\n\nIf leadtype = CGL, then\nproductcode = DF or VF",
    "validation": "For leadtype = CGL then possible product codes would be VF or DF\nFor leadtype = CGL all product codes are allowed.\n\nAppropriate errors to be thrown in case of incorrect product code tagged for a Channel Partner Lead or Program Lead"
   },
   {
    "name": "Anchor PAN No.",
    "path": "leaddetails",
    "key": "anchorpannumber",
    "desc": "This is the PAN no. of the Anchor. (both in case of Program Lead or Channel Partner Lead)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Regex for PAN No.\nPAN No. is of 10 digits\n1st - 3rd Digits = AAA - ZZZ or aaa-zzz\n4th Digit = P or C or H or A or B or G or J or L or F or T\n5th Digit = Alphabet\n6th - 9th Digit = 0000 to 1111 sequence\n10th Digit = Alphabet\n\nIn case leadtype = CGL -> provide the PAN no. of the Anchor for the Channel Partner Lead provided.\nIn case leadtype = PGL -> provide the PAN No. of the Program Lead itself (Anchor itself)"
   },
   {
    "name": "Lead Name",
    "path": "leaddetails",
    "key": "leadname",
    "desc": "This is the Name of the Anchor in case of  (Program Lead)\nThis is the Name of the Dealer in case of (Channel Partner Lead)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nOnly alphanumeric values allowed"
   },
   {
    "name": "Lead Primary GSTN",
    "path": "leaddetails",
    "key": "leadprimarygstn",
    "desc": "This is the primary GSTN of the Anchor (in case of Program Lead)\nThis is the primary GSTN of the Dealer (in case of Channel Partner Lead)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Regex for GST No.:\nGST No. is of 15 Alpha Numeric Digits\nFirst 2 Digits are numeric and values can be only from GST State Code Master.\n3rd - 5th Digits = AAA - ZZZ or aaa-zzz\n6th Digit = P or C or H or A or B or G or J or L or F or T\n7th Digit = Alphabet\n8th - 11th Digit = 0000 to 1111 sequence\n12th Digit = Alphabet\n13th Digit = Alphabet or Number\n14th Digit = Z or z\n15th Digit = Alphabet or Number\n\nThe PAN should be sub-string of the GSTN entered in the system"
   },
   {
    "name": "Lead Constitution",
    "path": "leaddetails",
    "key": "leadconstitution",
    "desc": "This is the constitution of the Anchor in case of Program Lead.\nThis is the constitution of the Dealer in case of Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nShould be restricted to the values provided in Dropdown"
   },
   {
    "name": "Lead Date of Incorporation",
    "path": "leaddetails",
    "key": "leaddateofincorporation",
    "desc": "This is the Date of Incorporation of the Anchor in case of Program Lead.\nThis is the Date of Incorporation of the Dealer in case of Channel Partner Lead",
    "type": "<integer> -epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "DD-MM-YYYY",
    "validation": "Possible list of Values:\nDD should be between 1 - 28/29/30/31 depending on MM \nMM should be between 1 - 12\nYYYY should be <= Current Year values\nDD-MM-YYYY should not be todays date"
   },
   {
    "name": "Lead Industry Classification",
    "path": "leaddetails",
    "key": "leadindustryclassification",
    "desc": "This is the Industry Classification of the Anchor in case of Program Lead.\nThis is the Industry Classification of the Dealer in case of Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Refer Industry Master for Validation"
   },
   {
    "name": "Lead Registered Address",
    "path": "leaddetails",
    "key": "leadregisteredaddress",
    "desc": "This is the Registered Address of the Anchor in case of Program Lead.\nThis is the Registered Address of the Dealer in case of Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nThis can include alphanumeric values with any special characters to be allowed as well.\n\nMax Length = 100"
   },
   {
    "name": "Min. Requested Limit (in INR Lakhs)",
    "path": "leaddetails",
    "key": "leadminexpectedlimit",
    "desc": "This is the Min. Requested Limit (in INR Lakhs) in case of Program Lead.\nThis is the Min. Requested Limit (in INR Lakhs) of the Dealer in case of Channel Partner Lead",
    "type": "<integer> - Long",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nOnly Numeric Values allowed (no decimal values).\nMin. Requested Limit (in INR Lakhs)>= 0"
   },
   {
    "name": "Max. Requested Limit (in INR Lakhs)",
    "path": "leaddetails",
    "key": "leadmaxexpectedlimit",
    "desc": "This is the Max. Requested Limit (in INR Lakhs) for the Anchor in case of Program Lead.\nThis is the Max. Requested Limit (in INR Lakhs) of the Dealer in case of Channel Partner Lead",
    "type": "<integer> - Long",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "\"Possible list of Values:\nOnly Numeric Values allowed (no decimal values).\nMax. Requested Limit (in INR Lakhs) > Min. Requested Limit (in INR Lakhs)\nMax. Requested Limit (in INR Lakhs) > 0"
   },
   {
    "name": "Min. Expected ROI (in %)",
    "path": "leaddetails",
    "key": "leadminexpectedroi",
    "desc": "This is the Min. Expected ROI (in %) in case of Program Lead.\nThis is the Min. Expected ROI (in %) of the Dealer in case of Channel Partner Lead",
    "type": "<decimal>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nDecimal Values to be allowed\nMin. Expected ROI (in %) >= 0"
   },
   {
    "name": "Max. Expected ROI (in %)",
    "path": "leaddetails",
    "key": "leadmaxexpectedroi",
    "desc": "This is the Max. Expected ROI (in %) for the Anchor in case of Program Lead.\nThis is the Max. Expected ROI (in %) of the Dealer in case of Channel Partner Lead",
    "type": "<decimal>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nDecimal Values to be allowed\nMax. Expected ROI (in %) >= Min. Expected ROI (in %) \n&\nMax. Expected ROI (in %) >= 0"
   },
   {
    "name": "Relationship Vintage with Anchor (in months)",
    "path": "leaddetails",
    "key": "relationshipvintagewithanchor",
    "desc": "This is the Relationship Vintage of the Dealer with the Anchor (in months)",
    "type": "<integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nRelationship Vintage with Anchor (in months) >= 1"
   },
   {
    "name": "Conduct with Anchor (in last 12 months)",
    "path": "leaddetails",
    "key": "conductwithanchor",
    "desc": "This is the Conduct with Anchor of the Channel Partner for the last 12 months",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nShould be restricted to the values provided in Dropdown"
   },
   {
    "name": "Anchor Recommended Limit (in INR Lakhs)",
    "path": "leaddetails",
    "key": "anchorrecommendedlimit",
    "desc": "This is the Anchor Recommended limit for the Channel Partner (in INR Lakhs)",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nAnchor Recommended Limit (in INR Lakhs) > 0"
   },
   {
    "name": "Purchases/Sales from Anchor for FY-2024-2025 (Current) (INR Lakhs)",
    "path": "leaddetails->purchasesalesfromtoanchor",
    "key": "currentfyyear",
    "desc": "This is the Purchase/Sales from/to Anchor for current financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Purchases/Sales from Anchor for FY-2023-2024 (INR Lakhs)",
    "path": "leaddetails->purchasesalesfromtoanchor",
    "key": "lastfyyear",
    "desc": "This is the Purchase/Sales from/to Anchor for Last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Purchases/Sales from Anchor for FY-2022-2023 (INR Lakhs)",
    "path": "leaddetails->purchasesalesfromtoanchor",
    "key": "secondlastfyyear",
    "desc": "This is the Purchase/Sales from/to Anchor for Second Last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Dependency on Anchor FY-2024-2025 (Current) (in %)",
    "path": "leaddetails->dependencyonanchor",
    "key": "currentfyyear",
    "desc": "This is the Dependency on Anchor for current financial year",
    "type": "<decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case of leadtype = CPL & productcode = DF\n\nNot required in other cases. In all other cases these fields should be ignored",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Dependency on Anchor FY-2023-2024 (in %)",
    "path": "leaddetails->dependencyonanchor",
    "key": "lastfyyear",
    "desc": "This is the Dependency on Anchor for last financial year",
    "type": "<decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case of leadtype = CPL & productcode=DF\n\nNot required in other cases. In all other cases these fields should be ignored",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Dependency on Anchor FY-2022-2023 (in %)",
    "path": "leaddetails->dependencyonanchor",
    "key": "secondlastfyyear",
    "desc": "This is the Dependency on Anchor for second last financial year",
    "type": "<decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case of leadtype = CPL & productcode=DF\n\nNot required in other cases. In all other cases these fields should be ignored",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Turnover for FY-2024-2025 (Current) (INR Lakhs)",
    "path": "leaddetails->turnover",
    "key": "currentfyyear",
    "desc": "This is the turnover of the Channel Partner for current financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Turnover for FY-2023-2024 (INR Lakhs)",
    "path": "leaddetails->turnover",
    "key": "lastfyyear",
    "desc": "This is the turnover of the Channel Partner for last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Turnover for FY-2022-2023 (INR Lakhs)",
    "path": "leaddetails->turnover",
    "key": "secondlastfyyear",
    "desc": "This is the turnover of the Channel Partner for second last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "PAT for FY-2024-2025 (Current) (INR Lakhs)",
    "path": "leaddetails->profitaftertax",
    "key": "currentfyyear",
    "desc": "This is the Profit After Tax of the Channel Partner for current financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "PAT for FY-2023-2024 (INR Lakhs)",
    "path": "leaddetails->profitaftertax",
    "key": "lastfyyear",
    "desc": "This is the Profit After Tax of the Channel Partner for Last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "PAT for FY-2022-2023 (INR Lakhs)",
    "path": "leaddetails->profitaftertax",
    "key": "secondlastfyyear",
    "desc": "This is the Profit After Tax of the Channel Partner for Second Last financial year",
    "type": "<integer> - Long",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nField  >= 0"
   },
   {
    "name": "Credit Period (in days)",
    "path": "leaddetails",
    "key": "creditperiod",
    "desc": "This is is the Program Credit Period in case leadtype = PGL\nThis is the Channel Partner Credit Period in case leadtype = CPL",
    "type": "<integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nCredit Period (in days) >= 1"
   },
   {
    "name": "External Rating",
    "path": "leaddetails",
    "key": "externalrating",
    "desc": "This is the External rating of the Anchor",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=PGL\n\nNot Required in case leadtype = CPL\nIn case this field is provided in case of leadtype = CPL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "External rating Agency",
    "path": "leaddetails",
    "key": "externalratingagency",
    "desc": "This is the External Rating Agency in case of Program Lead",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=PGL\n\nNot Required in case leadtype = CPL\nIn case this field is provided in case of leadtype = CPL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Prospective No. of Channel Partners",
    "path": "leaddetails",
    "key": "prospectivenoofchannelpartners",
    "desc": "This is the prospective no. of channel partners for a particular program lead",
    "type": "<integer>",
    "mand": "No",
    "mandRule": "No\n\nMay be provided only in case leadtype=PGL",
    "mandKind": "optional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nProspective No. of Channel Partners >= 0"
   },
   {
    "name": "Average Channel Partner Limit (in INR Lakhs)",
    "path": "leaddetails",
    "key": "averagechannelpartnerlimit",
    "desc": "This is the average channel partner limit (in INR Lakhs) in case of a Program lead",
    "type": "<integer> - Long",
    "mand": "No",
    "mandRule": "No\n\nMay be provided only in case leadtype=PGL",
    "mandKind": "optional",
    "sample": "",
    "validation": "Possible list of Values:\nInteger values expected\nAverage Channel Partner Limit (in INR Lakhs)  >= 0"
   },
   {
    "name": "Is Channel Partner an MSME ?",
    "path": "leaddetails",
    "key": "ischannelpartnerasme",
    "desc": "",
    "type": "<string>",
    "mand": "No",
    "mandRule": "No\n\nMay be provided only in case leadtype=CGL",
    "mandKind": "optional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "UDYAM Registation No.",
    "path": "leaddetails",
    "key": "channelpartnerudyamno",
    "desc": "",
    "type": "<string>",
    "mand": "No",
    "mandRule": "No\n\nMay be provided only in case leadtype=CGL",
    "mandKind": "optional",
    "sample": "",
    "validation": "Regex For UDYAM Number:\nUDYAM  No. is of 19 digits\nLetters 1 to 5 : UDYAM (Should be static string - case insensitive)\nLetter 6 - to be \"-\" (static value)\nLetter 7-8 : to be characters (case insensitive)\nLetter 9 : to be \"-\"\nLetters 10-11: to be numeric (This is the city code)\nLetter 12: to be \"-\" (This is static value)\nLetter 13-19  – Are special Udyam Code assigned to a company, similar to an Aadhar number (This is to be numeric)"
   },
   {
    "name": "Mapping Details - Lender PSB Platform ID",
    "path": "leaddetails->chooselenders",
    "key": "lenderpsbplatformid",
    "desc": "This is the PSB Platform ID of the Lender to which the lead is to be sent to.\nPlease  Note:\nIn case of leadtype = CPL, Sourcing partner should have corresponding product as active. Also there should be an active program for the combination of Sourcing Partner <> Lender for that particular product",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This is the PSB Platform ID of the Lender to which the lead is to be sent to.\nPlease  Note:\nIn case of leadtype = CPL, Sourcing partner should have corresponding product as active. Also there should be an active program for the combination of Sourcing Partner <> Lender for that particular product"
   },
   {
    "name": "Mapping Details - Program PSB Platform ID",
    "path": "leaddetails->chooselenders",
    "key": "psbplatformprogramid",
    "desc": "This is the PSB Platform ID of the Program to which the Channel Partner Lead is to be mapped to\nPlease  Note:\nIn case of leadtype = CPL, Sourcing partner should have corresponding product as active. Also there should be an active program for the combination of Sourcing Partner <> Lender for that particular product",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nMandatory only in case leadtype=CPL\n\nNot Required in case leadtype = PGL\nIn case this field is provided in case of leadtype = PGL then ignore /discard this value",
    "mandKind": "conditional",
    "sample": "",
    "validation": "This is the PSB Platform ID of the Program to which the Channel Partner Lead is to be mapped to\nPlease  Note:\nIn case of leadtype = CPL, Sourcing partner should have corresponding product as active. Also there should be an active program for the combination of Sourcing Partner <> Lender for that particular product"
   },
   {
    "name": "Authorized Person Details -> Authorized Person Name",
    "path": "leaddetails->authorizedpersondetails",
    "key": "authorizedpersonname",
    "desc": "This is the details of authorized person name",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nThis can include alphanumeric values with any special characters to be allowed as well."
   },
   {
    "name": "Authorized Person Details -> Authorized Person Email ID",
    "path": "leaddetails->authorizedpersondetails",
    "key": "authorizedpersonemailid",
    "desc": "This is the details of authorized person email id",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nEmail Regex to be applied"
   },
   {
    "name": "Authorized Person Details -> Authorized Person Mobile No.",
    "path": "leaddetails->authorizedpersondetails",
    "key": "authorizedpersonmobileno",
    "desc": "This is the details of authorized person mobile no",
    "type": "<integer> - Long",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nMobile Regex to be applied (10 digits)"
   },
   {
    "name": "Authorized Person Details -> Details to be used for Onbaording",
    "path": "leaddetails->authorizedpersondetails",
    "key": "tobeusedforonboarding",
    "desc": "This is to denote whether the mentioned authorized person details is to be used for onboarding or not ?",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Sourcing Partner SPOC Name",
    "path": "",
    "key": "sourcingpartnerspocname",
    "desc": "This is the name of the SPOC of sourcing partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nThis can include alphanumeric values with any special characters to be allowed as well."
   },
   {
    "name": "Sourcing Partner SPOC Email ID",
    "path": "",
    "key": "sourcingpartneremailid",
    "desc": "This is the email of the SPOC of sourcing partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nEmail Regex to be applied"
   },
   {
    "name": "Souricng Partner SPOC Mobile No.",
    "path": "",
    "key": "sourcingpartnerspocmobileno",
    "desc": "This is the mobile no of the SPOC of sourcing partner",
    "type": "<integer> - Long",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values:\nMobile Regex to be applied (10 digits)"
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   }
  ],
  "response": [
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   },
   {
    "name": "Overall Bulk Upload Status",
    "path": "",
    "key": "overallbulkuploadstatus",
    "desc": "This is the overall status of the Bulk uploaded Lead file",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "overallbulkuploadstatus = Sucess (if all the leads provided in the bulk upload file have been successfully created)\noverallbulkuploadstatus = Partial Success (if only some of the leads provided in the bulk upload request payload have been successfully created)\noverallbulkuploadstatus = Failure (if all the Leads provided as part of the bulk upload request payload have failed)\noverallbulkuploadstatus = Under Process (If the processing of Leads as part of the request payload in WIP)",
    "validation": ""
   },
   {
    "name": "Lead Creation Status",
    "path": "leaddetails",
    "key": "leadstatus",
    "desc": "This is the Lead status (can be Draft or Active or Failure)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nThis will be available only in case of overallbulkuploadstatus  = Success or Partial Sucess or Failure",
    "mandKind": "conditional",
    "sample": "leadstatus = Active if the Lead is successfully uploaded\nleadstatus = Draft if the Lead creation is stuck in between\nleadstatus = Failure if the Lead creation has failed\n\nleaddetails will be available as part of the response only if overallbulkuploadstatus = Sucess or Partial Success or Failure",
    "validation": ""
   },
   {
    "name": "PSB Platform ID",
    "path": "leaddetails",
    "key": "psbplatformid",
    "desc": "This is the PSB Platform ID for the Lead sent as part of the response payload (in case lead is created successfully) else null",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nThis will be available only in case of overallbulkuploadstatus  = Success or Partial Sucess or Failure",
    "mandKind": "conditional",
    "sample": "leaddetails will be available as part of the response only if overallbulkuploadstatus = Sucess or Partial Success or Failure",
    "validation": ""
   },
   {
    "name": "Error code",
    "path": "leaddetails",
    "key": "errorcode",
    "desc": "This is the custom error code received in case leadstatus = Failure or Draft",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nThis will be available only in case of overallbulkuploadstatus  = Success or Partial Sucess or Failure  &  leadstatus = Failure or Draft",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Error Message",
    "path": "leaddetails",
    "key": "errormessage",
    "desc": "This is the custom error message received in case leadstatus = Failure or Draft",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nThis will be available only in case of overallbulkuploadstatus  = Success or Partial Sucess or Failure & leadstatus = Failure or Draft",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Sourcing Partner Lead ID",
    "path": "leaddetails",
    "key": "sourcingpartnerleadid",
    "desc": "This is the unique identifier for the Lead available at Sourcing Partners end.",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Possible list of Values: This can include alphanumeric values with any special characters to be allowed as well."
   },
   {
    "name": "Lead Creation Timestamp",
    "path": "leaddetails",
    "key": "leadtimestamp",
    "desc": "This is the timestamp of Lead Creation/Lead Failure",
    "type": "<integer> -epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "DD-MM-YYYY HH:MM:SS",
    "validation": ""
   },
   {
    "name": "Response Timestamp",
    "path": "",
    "key": "responsetimestamp",
    "desc": "This is the response timestamp for the status response",
    "type": "<integer> -epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "DD-MM-YYYY HH:MM:SS",
    "validation": ""
   }
  ]
 },
 "getStatus": {
  "request": [
   {
    "name": "PSB Platform Lead ID",
    "path": "",
    "key": "psbleadid",
    "desc": "This is is the PSB Paltform Lead ID. Lead ID can be of Program Lead or Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Should be a valid PSB Platform Channel Partner ID or Program ID"
   },
   {
    "name": "Fintech PSB Platform ID",
    "path": "",
    "key": "fintechpsbplatformid",
    "desc": "This is the PSB Platform ID for the Fintech.",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender PSB Platform ID",
    "path": "",
    "key": "lenderpsbplatformid",
    "desc": "This is the PSB Platform ID for the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   }
  ],
  "response": [
   {
    "name": "API Status Code",
    "path": "",
    "key": "status",
    "desc": "This is the status code for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "API Status Message",
    "path": "",
    "key": "message",
    "desc": "This is the status message for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "PSB Lead Type",
    "path": "",
    "key": "psbleadtype",
    "desc": "This is the type of Lead in PSB (Program Lead / Channel Partner Lead)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Program Lead -> Lead for New Anchor Programs (irrespective of the Product Type)\nChannel Partner Lead -> Lead for Channel Partner Leads for (DF / VF product codes)"
   },
   {
    "name": "Product Code",
    "path": "",
    "key": "productcode",
    "desc": "This is used to provide the product code details",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "DF : Dealer Finance\nVF : Vendor Finance\nSID: Sales Invoice Discounting\nPID: Purchase Invoice Discounting\nFACT: Factoring\nREVFACT: Reverse Factoring"
   },
   {
    "name": "PSB Platform Stage",
    "path": "",
    "key": "psbstage",
    "desc": "This is the stage value in PSB Platform. This will determine whether customer is in Opportunities, Matches, Offers, Active (Program/Channel Partner Stage)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Lead: Stage to reflect as Lead (for both Program Lead / Channel Partner Lead) as long as the Lead is in Draft Stage\nOpportunities: If the Lead (Program Lead / Channel Partner Lead) is converted into an Opportunity the stage value will reflect as Opportunity.\nMatches: If the Lender was selected in the Lead (Program Lead / Channel Partner Lead), then the callback stage will reflect in Matches Stage \nOffers: If the Lead is in Matches stage the stage should be reflected as Offers.\nProgram: If the Lead is converted into a Program then the stage reflected would be Program.\nChannel Partner: If the Lead is mapped successfully to a Program on PSB Platform the stage would be reflected ast Channel Partner stage.\n\nCallbacks to Sourcing Partner will be sent from Lead Stage."
   },
   {
    "name": "PSB Platform Status -Sourcing Partner",
    "path": "",
    "key": "psbsourcingpartnerstatus",
    "desc": "This provides the Actual Status within the stage for a Program Lead or Channel Partner Lead for a Sourcing Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Refer Masters for Status Description\n\nThis status is only sent for Lenders"
   },
   {
    "name": "Last Status update Date",
    "path": "",
    "key": "psblaststatusupdatedate",
    "desc": "This provides the actual key for Last status update date",
    "type": "<date> - epoc timestamp",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This will represent the date of update of last status (DD-MM-YYYY HH:MM:SS in epoch)"
   },
   {
    "name": "PSB Platform Program ID",
    "path": "",
    "key": "psbprogramid",
    "desc": "This provides the PSB Platform ID for the Program (for the Lender) available in case of Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbleadtype = Channel Partner Lead \n2) psbleadtype = Program Lead & psbstage = Program",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Name proposed by the Lender",
    "path": "psbprogramdetails",
    "key": "lenderprogramname",
    "desc": "This is the program name as proposed by the Lender",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Proposed Program Limit",
    "path": "psbprogramdetails",
    "key": "programlimit",
    "desc": "This is the Program Limit Proposed / Set Up by the Lender",
    "type": "<Map>-> <integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Proposed Program ROI",
    "path": "psbprogramdetails",
    "key": "programroi",
    "desc": "This is the Program ROI Proposed / Set up by the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Benchmark for ROI",
    "path": "psbprogramdetails",
    "key": "programroibenchmarkcode",
    "desc": "This is the Benchmark code to be provided by the Lender (corresponding to Benchmark used by the Lender)",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Spread %",
    "path": "psbprogramdetails",
    "key": "psbroispread",
    "desc": "This is usually the sum of Business & Credit spread for the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Tenor (in Days)",
    "path": "psbprogramdetails",
    "key": "programtenor",
    "desc": "This is the Credit Period agreed for the Program (in days)",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Interest Type",
    "path": "psbprogramdetails",
    "key": "programinteresttype",
    "desc": "This is the interest mechanism for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Grace Period Configuration",
    "path": "psbprogramdetails",
    "key": "programgraceperiodapplicable",
    "desc": "This field is used to provide the grace period configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Grace Period Days",
    "path": "psbprogramdetails",
    "key": "programgraceperioddays",
    "desc": "This field is used to provide grace period days if grace period is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Stop Supply Days Configuration",
    "path": "psbprogramdetails",
    "key": "programstopsupplyapplicable",
    "desc": "This field is used to provide the stop supply configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Stop Supply Days",
    "path": "psbprogramdetails",
    "key": "programstopsupplydays",
    "desc": "This field is used to provide stop supply days if stop supply is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program FLDG configuration",
    "path": "psbprogramdetails",
    "key": "programfldgapplicable",
    "desc": "This program is used to provide whether FLDG is applicable for program or not",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program FLDG %",
    "path": "psbprogramdetails",
    "key": "programfldgpercentage",
    "desc": "This field is used to provide the fldg percentage for a program is fldg is applicable for the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Penal Interest Rate (%)",
    "path": "psbprogramdetails",
    "key": "programpenalinterestrate",
    "desc": "This is the penal interest rate applicable for the Program",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Minimum Channel Partner Limit (in INR)",
    "path": "",
    "key": "minchannelpartnerlimit",
    "desc": "This is the minimum channel partner limit applicable for Program",
    "type": "<integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Maximum Channel Partner Limit (in INR)",
    "path": "",
    "key": "maxchannelpartnerlimit",
    "desc": "This is the maximum channel partner limit applicable for Program",
    "type": "<integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Key Terms and Conditions",
    "path": "programkeytermsandconditions",
    "key": "conditiondescription",
    "desc": "This is is the description of terms and conditions stipulated as part of Offer or at the time of activation of Program",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Final MOU Agreed",
    "path": "",
    "key": "finalmou",
    "desc": "This is the base64 of the final MOU signed (PDF) with the Anchor for the Program sanctioned",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Sanction Date",
    "path": "",
    "key": "programsanctiondate",
    "desc": "This is the Program Sanction Date as communicated by the Lender",
    "type": "<date> (epoch)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Programs & psbleadtype = Program Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Proposed CP Limit",
    "path": "psbprogramdetails",
    "key": "cplimit",
    "desc": "This is the CP Limit Proposed / Set Up by the Lender",
    "type": "<Map>-> <integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Proposed CP ROI",
    "path": "psbprogramdetails",
    "key": "cproi",
    "desc": "This is the CP ROI Proposed / Set up by the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Benchmark for ROI",
    "path": "psbprogramdetails",
    "key": "cproibenchmarkcode",
    "desc": "This is the Benchmark code to be provided by the Lender (corresponding to Benchmark used by the Lender)",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Offers &  { psblenderstatus = Offers Submitted or Offer Accepted or Offer Rejected or  Offer Expired } & psbleadtype = Channel Partner Lead\n2) psbstage = Programs & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Spread %",
    "path": "psbprogramdetails",
    "key": "cproispread",
    "desc": "This is usually the sum of Business & Credit spread for the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Tenor (in Days)",
    "path": "psbprogramdetails",
    "key": "cptenor",
    "desc": "This is the Credit Period agreed for the CP (in days)",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Program Interest Type",
    "path": "psbprogramdetails",
    "key": "cpinteresttype",
    "desc": "This is the interest mechanism for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Grace Period Configuration",
    "path": "psbprogramdetails",
    "key": "cpgraceperiodapplicable",
    "desc": "This field is used to provide the grace period configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Grace Period Days",
    "path": "psbprogramdetails",
    "key": "cpgraceperioddays",
    "desc": "This field is used to provide grace period days if grace period is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Stop Supply Days Configuration",
    "path": "psbprogramdetails",
    "key": "cpstopsupplyapplicable",
    "desc": "This field is used to provide the stop supply configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead &  productcode not equal to  SID or PID or FACT or REVFACT \n\nIn other scenarios this field will not be requried",
    "mandKind": "unspecified",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Stop Supply Days",
    "path": "psbprogramdetails",
    "key": "cpstopsupplydays",
    "desc": "This field is used to provide stop supply days if stop supply is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead &  productcode not equal to  SID or PID or FACT or REVFACT \n\nIn other scenarios this field will not be requried",
    "mandKind": "unspecified",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Penal Interest Rate (%)",
    "path": "psbprogramdetails",
    "key": "cppenalinterestrate",
    "desc": "This is the penal interest rate applicable for the CP",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Key Terms and Conditions",
    "path": "cpkeytermsandconditions",
    "key": "conditiondescription",
    "desc": "This is is the description of terms and conditions stipulated as part of Offer or at the time of activation of CP",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Final Sanction Letter",
    "path": "",
    "key": "finalsanctionletter",
    "desc": "This is the base64 of the final CP Sanction Letter",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1) psbstage = Chanel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "CP Sanction Date",
    "path": "",
    "key": "cpsanctiondate",
    "desc": "This is the CP Sanction Date as communicated by the Lender",
    "type": "<date> (epoch)",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Channel Partner & psbleadtype = Channel Partner Lead\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Matched Lender Name",
    "path": "matches",
    "key": "matchedlendername",
    "desc": "This is the name of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Found \n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Matched Lender Platform ID",
    "path": "matches",
    "key": "matchedlenderpsbplatformid",
    "desc": "This is the PSB Platform ID of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Found \n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Match Timestamp",
    "path": "matches",
    "key": "matchtimestamp",
    "desc": "This is the timestamp of the matched lender (in case of psbstage = Match Found)",
    "type": "<date> - epoc timestamp",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Found \n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Match Program ID",
    "path": "matches",
    "key": "matchedpsbplatformprogramid",
    "desc": "This is the PSB Platform ID of the Program of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbleadtype = Channel Partner Lead & psbsourcingpartnerstatus = Match Found\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Matched Program Name",
    "path": "matches",
    "key": "matchedpsbplatformprogramname",
    "desc": "This is the Program Name of the Program of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbleadtype = Channel Partner Lead & psbsourcingpartnerstatus = Match Found\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Selected Match - Lender Name",
    "path": "selectedmatches",
    "key": "matchedlendername",
    "desc": "This is the name of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Selected\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Selected Match - Lender Platorm ID",
    "path": "selectedmatches",
    "key": "matchedlenderpsbplatformid",
    "desc": "This is the PSB Platform ID of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Selected\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Selected Match - Timestamp",
    "path": "selectedmatches",
    "key": "matchtimestamp",
    "desc": "This is the timestamp of the matched lender (in case of psbstage = Match Found)",
    "type": "<date> - epoc timestamp",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbsourcingpartnerstatus = Match Selected\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Selected Match - Program ID",
    "path": "selectedmatches",
    "key": "matchedpsbplatformprogramid",
    "desc": "This is the PSB Platform ID of the Program of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbleadtype = Channel Partner Lead & psbsourcingpartnerstatus = Match Selected\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Selected Match - Program Name",
    "path": "selectedmatches",
    "key": "matchedpsbplatformprogramname",
    "desc": "This is the Program Name of the Program of the matched lender (in case of psbstage = Match Found)",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\n\nOnly required in following sceanrios:\n1)  psbstage = Matches & psbleadtype = Channel Partner Lead & psbsourcingpartnerstatus = Match Selected\n\nIn other scenarios this field will not be requried",
    "mandKind": "conditional",
    "sample": "",
    "validation": ""
   },
   {
    "name": "PSB Platform Program ID",
    "path": "offerdetails",
    "key": "psbprogramid",
    "desc": "This provides the PSB Platform ID for the Program (for the Lender) available in case of Channel Partner Lead",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbleadtype = Channel Partner Lead & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Offer Expiry Period",
    "path": "offerdetails",
    "key": "psbofferexpiryperiod",
    "desc": "This is the Offer Expiry period (in days). This is always calculated from the request timestamp. Offer Expiry Timestamp will be provied as part of the API Response",
    "type": "<integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Offer Lender - Lender Name",
    "path": "offerdetails",
    "key": "lendername",
    "desc": "This is the Lender who has provided the offer",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Offer Lender - Lender Platform ID",
    "path": "offerdetails",
    "key": "lenderpsbplatformid",
    "desc": "This is the PSB Platform ID of the Lender who has provided the Offer",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Offer Lender - Offer Timestanp",
    "path": "offerdetails",
    "key": "lenderoffertimestamp",
    "desc": "This is the timestamp for Offer",
    "type": "<date> - epoc timestamp",
    "mand": "",
    "mandRule": "",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Offer Lender - Offer Status",
    "path": "offerdetails",
    "key": "offerstatus",
    "desc": "This is the status of Offer (Selected / Rejected)",
    "type": "<string>",
    "mand": "",
    "mandRule": "",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program Name proposed by the Lender",
    "path": "offerdetails",
    "key": "lenderprogramname",
    "desc": "This is the program name as proposed by the Lender",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Proposed Program Limit",
    "path": "offerdetails",
    "key": "programlimit",
    "desc": "This is the Program Limit Proposed / Set Up by the Lender",
    "type": "<Map>-> <integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Proposed Program ROI",
    "path": "offerdetails",
    "key": "programroi",
    "desc": "This is the Program ROI Proposed / Set up by the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Benchmark for ROI",
    "path": "offerdetails",
    "key": "programroibenchmarkcode",
    "desc": "This is the Benchmark code to be provided by the Lender (corresponding to Benchmark used by the Lender)",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Spread %",
    "path": "offerdetails",
    "key": "psbroispread",
    "desc": "This is usually the sum of Business & Credit spread for the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program Tenor (in Days)",
    "path": "offerdetails",
    "key": "programtenor",
    "desc": "This is the Credit Period agreed for the Program (in days)",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program Interest Type",
    "path": "offerdetails",
    "key": "programinteresttype",
    "desc": "This is the interest mechanism for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Grace Period Configuration",
    "path": "offerdetails",
    "key": "programgraceperiodapplicable",
    "desc": "This field is used to provide the grace period configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Grace Period Days",
    "path": "offerdetails",
    "key": "programgraceperioddays",
    "desc": "This field is used to provide grace period days if grace period is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Stop Supply Days Configuration",
    "path": "offerdetails",
    "key": "programstopsupplyapplicable",
    "desc": "This field is used to provide the stop supply configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Stop Supply Days",
    "path": "offerdetails",
    "key": "programstopsupplydays",
    "desc": "This field is used to provide stop supply days if stop supply is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program FLDG configuration",
    "path": "offerdetails",
    "key": "programfldgapplicable",
    "desc": "This program is used to provide whether FLDG is applicable for program or not",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program FLDG %",
    "path": "offerdetails",
    "key": "programfldgpercentage",
    "desc": "This field is used to provide the fldg percentage for a program is fldg is applicable for the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Penal Interest Rate (%)",
    "path": "offerdetails",
    "key": "programpenalinterestrate",
    "desc": "This is the penal interest rate applicable for the Program",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Minimum Channel Partner Limit (in INR)",
    "path": "offerdetails",
    "key": "minchannelpartnerlimit",
    "desc": "This is the minimum channel partner limit applicable for Program",
    "type": "<integer> (long)",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Maximum Channel Partner Limit (in INR)",
    "path": "offerdetails",
    "key": "maxchannelpartnerlimit",
    "desc": "This is the maximum channel partner limit applicable for Program",
    "type": "<integer> (long)",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Key Terms and Conditions",
    "path": "offerdetails",
    "key": "conditiondescription",
    "desc": "This is is the description of terms and conditions stipulated as part of Offer or at the time of activation of Program",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Program Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Proposed CP Limit",
    "path": "offerdetails",
    "key": "cplimit",
    "desc": "This is the CP Limit Proposed / Set Up by the Lender",
    "type": "<Map>-> <integer> (long)",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Proposed CP ROI",
    "path": "offerdetails",
    "key": "cproi",
    "desc": "This is the CP ROI Proposed / Set up by the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Benchmark for ROI",
    "path": "offerdetails",
    "key": "cproibenchmarkcode",
    "desc": "This is the Benchmark code to be provided by the Lender (corresponding to Benchmark used by the Lender)",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Spread %",
    "path": "offerdetails",
    "key": "cproispread",
    "desc": "This is usually the sum of Business & Credit spread for the Lender",
    "type": "<Map>-> <decimal>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program Tenor (in Days)",
    "path": "offerdetails",
    "key": "cptenor",
    "desc": "This is the Credit Period agreed for the CP (in days)",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Program Interest Type",
    "path": "offerdetails",
    "key": "cpinteresttype",
    "desc": "This is the interest mechanism for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Grace Period Configuration",
    "path": "offerdetails",
    "key": "cpgraceperiodapplicable",
    "desc": "This field is used to provide the grace period configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Grace Period Days",
    "path": "offerdetails",
    "key": "cpgraceperioddays",
    "desc": "This field is used to provide grace period days if grace period is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Stop Supply Days Configuration",
    "path": "offerdetails",
    "key": "cpstopsupplyapplicable",
    "desc": "This field is used to provide the stop supply configuration for the Program",
    "type": "<Map>-> <string>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Stop Supply Days",
    "path": "offerdetails",
    "key": "cpstopsupplydays",
    "desc": "This field is used to provide stop supply days if stop supply is applicable in the program",
    "type": "<Map>-> <integer>",
    "mand": "\"Yes*",
    "mandRule": "\"Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead &  productcode not equal to  SID or PID or FACT or REVFACT\n\nIn other scenarios this should not be sent as part of the payload\"",
    "mandKind": "unspecified",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Penal Interest Rate (%)",
    "path": "offerdetails",
    "key": "cppenalinterestrate",
    "desc": "This is the penal interest rate applicable for the CP",
    "type": "<Map>-> <string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   },
   {
    "name": "Key Terms and Conditions",
    "path": "offerdetails",
    "key": "conditiondescription",
    "desc": "This is is the description of terms and conditions stipulated as part of Offer or at the time of activation of CP",
    "type": "<string>",
    "mand": "Yes*",
    "mandRule": "Yes*\nThis field is provided in the following scenarios:\n1) psbstage = Offers & psbsourcingpartnerstatus = Offers Submitted or Offer Accepted or Offer Rejected or Offer Expired or Customer Rejected & psbleadtype = Channel Partner Lead\n\nIn other scenarios this should not be sent as part of the payload",
    "mandKind": "conditional",
    "sample": "",
    "validation": "offerdetails will contain all the offers submitted as well as the offer selected."
   }
  ]
 },
 "partnerships": {
  "request": [
   {
    "name": "PSB Identifier",
    "path": "",
    "key": "psbidentifier",
    "desc": "Sourcing Partner to provide its own PSB Platform identifier to fetch partnership details from the PSB Platform XChange (for Lender itself)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Fintech Partnership Status",
    "path": "",
    "key": "partnershipstatus",
    "desc": "This allows the Sourcing Partner to provide a filter for the status of Lender Fintech Partnership. Partnership details to be provided basis the filter provided by the Sourcing Partner.",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "ALL : Proivde details of All Lender Fintech Partnerships (irrespective of the status)\nActive: Provide the details of only those Lender Fintech Partnerships which are in Active state\nIn Active: Provide the details of only those Lender Fintech Partnerships which are in In Active state.\nPending Approval: Provide the details of only those Lender Fintech Partnerships where the Fintech has requested for connection to the Lender and Lender has provided the Terms and conditions of the partnerships to the Fintech (Pending on Fintech)\nPending Signing: Provide the details of only those Lender Fintech Partnerships where Fintech has completed the signing of agreement but Lender signing is still pending.\nWIP: Provide the details of only those Lender Fintech Partnerships where the Fintech has requested for connection to the Lender but lender has not acted upon.\nRejected: Provide the details on only those Lender Fintech Partnerships where the partnership is in Rejected state.\n\nOne or more statuses are provided as part of the List. Please note field level validations should be Case insensitive. Also if ALL status is provided in a list along with other statuses then response will provide details of all partnerships (superseeding all other status filters)"
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   }
  ],
  "response": [
   {
    "name": "API Status Code",
    "path": "",
    "key": "status",
    "desc": "This is the status code for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "API Status Message",
    "path": "",
    "key": "message",
    "desc": "This is the status message for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Name",
    "path": "partnershipdetails",
    "key": "lendername",
    "desc": "This is the name of the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus"
   },
   {
    "name": "Lender PAN Number",
    "path": "partnershipdetails",
    "key": "lenderpannumber",
    "desc": "This is the PAN Number of the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus"
   },
   {
    "name": "Lender GST numbers",
    "path": "partnershipdetails->lendergstdetails",
    "key": "gstnumber",
    "desc": "This is a list of GSTNs for the Lender",
    "type": "<List> - <string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus"
   },
   {
    "name": "Lender PSB Identifier",
    "path": "partnershipdetails",
    "key": "lenderpsbidentifier",
    "desc": "This is the unique PSB identifier for the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus"
   },
   {
    "name": "Lender Partnership Status",
    "path": "partnershipdetails",
    "key": "partnershipstatus",
    "desc": "This is the partnership status for partnership between Sourcing Partner <> Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Active: Provide the details of only those Lender Fintech Partnerships which are in Active state\nIn Active: Provide the details of only those Lender Fintech Partnerships which are in In Active state.\nPending Approval: Provide the details of only those Lender Fintech Partnerships where the Fintech has requested for connection to the Lender and Lender has provided the Terms and conditions of the partnerships to the Fintech (Pending on Fintech)\nPending Signing: Provide the details of only those Lender Fintech Partnerships where Fintech has completed the signing of agreement but Lender signing is still pending.\nWIP: Provide the details of only those Lender Fintech Partnerships where the Fintech has requested for connection to the Lender but lender has not acted upon.\nRejected: Provide the details on only those Lender Fintech Partnerships where the partnership is in Rejected state.\n\nOnly provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus->statusfilters"
   },
   {
    "name": "Lender Product List",
    "path": "partnershipdetails->products",
    "key": "productcode",
    "desc": "This is the list of all products for a partnership for all statuses",
    "type": "<List> - <string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "DF : Dealer Finance\nVF : Vendor Finance\nSID: Sales Invoice Discounting\nPID: Purchase Invoice Discounting\nFACT: Factoring\nREVFACT: Reverse Factoring\n\nOnly provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus->statusfilters"
   },
   {
    "name": "Lender Total Program Count",
    "path": "partnershipdetails->products",
    "key": "totalprogramcount",
    "desc": "This is the Total Program count for product specified by productcode (irrespective of the status of the program)",
    "type": "<List> -  <integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Active Program Count",
    "path": "partnershipdetails->products",
    "key": "activeprogramcount",
    "desc": "This is the Total Active Program count for product specified by productcode",
    "type": "<List> -  <integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Total Channel Partner count",
    "path": "partnershipdetails->products",
    "key": "totalchannelpartnercount",
    "desc": "This is the Total Channel Partner count for product specified by productcode (irrespective of the status of the program)",
    "type": "<List> -  <integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "If partnershipdetails->products->productcode = SID or PID or FACT or REVFACT then partnershipdetails->products->totalchannelpartnercount = null\n\nsince in these products there is no Channel Partner"
   },
   {
    "name": "Lender Active Channel Partner count",
    "path": "partnershipdetails->products",
    "key": "activechannelpartnercount",
    "desc": "This is the Total Active Channel Partner count for product specified by productcode",
    "type": "<List> -  <integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "If partnershipdetails->products->productcode = SID or PID or FACT or REVFACT then partnershipdetails->products->totalchannelpartnercount = null\n\nsince in these products there is no Channel Partner"
   },
   {
    "name": "Pending Approval / Pending Signing / WIP / Active / In Active status since",
    "path": "partnershipdetails",
    "key": "currentstatusupdatedate",
    "desc": "This is the date when current status was updated",
    "type": "<date> - epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "if partnershipdetails->partnershipstatus = Active , then currentstatusupdatedate = Partnership Active Date\nif partnershipdetails->partnershipstatus = In Active, then currentstatusupdatedate = Date since partnership is In Active\nif partnershipdetails->partnershipstatus = Pending Approval, then currentstatusupdatedate = Date since partnership is in Pending Approval stage\nif partnershipdetails->partnershipstatus = Pending Signing, then currentstatusupdatedate = Date since partnership is in Pending Signing stage\nif partnershipdetails->partnershipstatus = WIP, then currentstatusupdatedate = Date since partnership is in WIP stage\nif partnershipdetails->partnershipstatus = Rejected , then currentstatusupdatedate = Date since partnership is in Rejected stage"
   },
   {
    "name": "Last Update By",
    "path": "partnershipdetails",
    "key": "lastupdatedby",
    "desc": "This is the details of Person who has made the last update to the Partnership",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Last Update by Person Email ID",
    "path": "partnershipdetails",
    "key": "lastupdatedbyemailid",
    "desc": "This is the email details of Person who has made the last udpate to the Partnership",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   }
  ]
 },
 "channelPartners": {
  "request": [
   {
    "name": "PSB Identifier",
    "path": "",
    "key": "psbidentifier",
    "desc": "Lender to provide the PSB Program ID",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This should be a valid Program PSB Platform identifier. Appropriate Regex to be applied"
   },
   {
    "name": "Fintech PSB Platform ID",
    "path": "",
    "key": "fintechpsbplatformid",
    "desc": "Lender to provide the PSB Platform ID for the Fintech Partner with which it is partnered on the PSB Platform Xchange.",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Anchor PAN No.",
    "path": "",
    "key": "anchorpannumber",
    "desc": "This is the PAN No. of the Anchor for which the Offer Details need to be provided",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "XXXXXXXXXX",
    "validation": "Regex for PAN No.\nPAN No. is of 10 digits\n1st - 3rd Digits = AAA - ZZZ or aaa-zzz\n4th Digit = P or C or H or A or B or G or J or L or F or T\n5th Digit = Alphabet\n6th - 9th Digit = 0000 to 1111 sequence\n10th Digit = Alphabet"
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   },
   {
    "name": "Type of Channel Partner",
    "path": "",
    "key": "channelpartnertype",
    "desc": "This is to be used as a filter by the Lender to obtain only Active / In Active Channel Partners for a particular program",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Each individual item in channelpartnertype should be values as per the dropdown specified. \nThis is to be used to filter all channel partners mapped to a particular program as part of the response"
   }
  ],
  "response": [
   {
    "name": "API Status Code",
    "path": "",
    "key": "status",
    "desc": "This is the status code for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "API Status Message",
    "path": "",
    "key": "message",
    "desc": "This is the status message for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Anchor Name",
    "path": "",
    "key": "anchorname",
    "desc": "This is the name of the Anchor for Program ID specified as part of the input",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Provided Program Name",
    "path": "",
    "key": "programname",
    "desc": "This is the name of the Program as provided by the Lender during activation of the Program",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Channel Partner Name",
    "path": "channelpartnerdetails",
    "key": "channelpartnerdetailsname",
    "desc": "This is the name of the Channel Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype\n\nThese details will not be available in case the Program itself is In Active"
   },
   {
    "name": "Channel Partner PAN Number",
    "path": "channelpartnerdetails",
    "key": "channelpartnerdetailspannumber",
    "desc": "This is the PAN Number of the Channel Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype\n\nThese details will not be available in case the Program itself is In Active"
   },
   {
    "name": "Channel Partner GST numbers",
    "path": "channelpartnerdetails->channelpartnerdetailsgstdetails",
    "key": "gstnumber",
    "desc": "This is a list of GSTNs for the Channel Partner",
    "type": "<List> - <string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype\n\nThese details will not be available in case the Program itself is In Active"
   },
   {
    "name": "Channel Partner PSB Identifier",
    "path": "channelpartnerdetails",
    "key": "channelpartnerdetailspsbidentifier",
    "desc": "This is the unique PSB identifier for the Channel Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype"
   },
   {
    "name": "Channel Partner Status",
    "path": "channelpartnerdetails",
    "key": "channelpartnerstatus",
    "desc": "This is the partnership status for partnership between Channel Partner <> Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype\n\nThese details will not be available in case the Program itself is In Active"
   },
   {
    "name": "Channel Partner Last Status Update Date",
    "path": "channelpartnerdetails",
    "key": "currentstatusupdatedate",
    "desc": "This is the date when current status was updated",
    "type": "<date> - epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "if channelpartnerdetails->channelpartnerstatus = Active , then currentstatusupdatedate = Channel Partner Activation Date\nif partnershipdetails->channelpartnerstatus = In Active, then currentstatusupdatedate = Date since Channel Partner is In Active\n\n\"Only provide details of Channel Partners where:\nchannelpartnerdetails ->channelpartnerstatus is available in channelpartnertype\"\n\nThese details will not be available in case the Program itself is In Active"
   },
   {
    "name": "Sourcing Partner Name",
    "path": "",
    "key": "sourcingpartnername",
    "desc": "This is the name of Sourcing Partner Name",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Last Update By",
    "path": "",
    "key": "lastupdatedby",
    "desc": "This is the details of Person who has made the last update to the Channel Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Last Update by Person Email ID",
    "path": "",
    "key": "lastupdatedbyemailid",
    "desc": "This is the email details of Person who has made the last udpate to the Channel Partner",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   }
  ]
 },
 "additionalLenders": {
  "request": [
   {
    "name": "PSB Identifier",
    "path": "",
    "key": "psbidentifier",
    "desc": "Sourcing Partner to provide its own PSB Platform identifier to fetch partnership details from the PSB Platform XChange (for Sourcing Partner itself)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "This can contain only Alphanumeric values. Max Length of  32"
   },
   {
    "name": "Product Code",
    "path": "",
    "key": "filterproductcode",
    "desc": "This is used by the Lender as a filter to identify the fintechs who are sourcing for product specified by the filter code",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "ALL: All Products\nDF : Dealer Finance\nVF : Vendor Finance\nSID: Sales Invoice Discounting\nPID: Purchase Invoice Discounting\nFACT: Factoring\nREVFACT: Reverse Factoring\n\nOne or more statuses are provided as part of the List. Please note field level validations should be Case insensitive. Also if ALL status is provided in a list along with other product codes then response will provide details of all sourcing partners currently not partnered with Lender but have any product on the platform as active."
   }
  ],
  "response": [
   {
    "name": "API Status Code",
    "path": "",
    "key": "status",
    "desc": "This is the status code for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "API Status Message",
    "path": "",
    "key": "message",
    "desc": "This is the status message for the response",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Customer Reference No.",
    "path": "",
    "key": "customerreferenceid",
    "desc": "This is unique customer reference id (required by PSB to provide a response against)",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Additional Lender Name",
    "path": "additionallenderdetails",
    "key": "lendername",
    "desc": "This is the name of the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Additional Lender PAN Number",
    "path": "additionallenderdetails",
    "key": "lenderpannumber",
    "desc": "This is the PAN Number of the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Additional Lender GST numbers",
    "path": "additionallenderdetails->lendergstdetails",
    "key": "gstnumber",
    "desc": "This is a list of GSTNs for the Lender",
    "type": "<List> - <string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Additional Lender PSB Identifier",
    "path": "additionallenderdetails",
    "key": "lenderpsbidentifier",
    "desc": "This is the unique PSB identifier for the Lender",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Active Products List",
    "path": "activeproductslist",
    "key": "productcodes",
    "desc": "This is the list of all Active product codes for these Lenders",
    "type": "<string>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "DF : Dealer Finance\nVF : Vendor Finance\nSID: Sales Invoice Discounting\nPID: Purchase Invoice Discounting\nFACT: Factoring\nREVFACT: Reverse Factoring\n\nOnly provide details of Partnerships where:\npartnershipdetails ->partnershipstatus is available in partnershipstatus->statusfilters\n\nResonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Count of Sourcing Partners Partnered for the Product Code mentoned",
    "path": "activeproductslist",
    "key": "sourcingpartnerspartnered",
    "desc": "This is the count of Sourcing Partners partnered for the product code mentioned",
    "type": "<integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Active Program Count for the product Code",
    "path": "activeproductslist",
    "key": "activeprogramcount",
    "desc": "This is the Total Active Program count for product specified by productcode",
    "type": "<integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Active Channel Partner Count for the product Code",
    "path": "activeproductslist",
    "key": "activechannelpartnercount",
    "desc": "This is the Total Active Channel Partner count for product specified by productcode",
    "type": "<integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": "Resonse of this API will provide only those list of Lender where following conditions are met:\n1) No Partnership with Sourcing Partner (irrespective of the status of the Partnership)\n2) Provide details of only those Lenders where filterproductcode contains product code whcih matches with any product code in additionallenderdetails->productcodes\n3) Lender should be in active state."
   },
   {
    "name": "Count of unique Sourcing Partners Partnered",
    "path": "",
    "key": "countofuniquesourcingpartnerspartnered",
    "desc": "This will provide the count of unique Sourcing Partners partnered on PSB (product agnostic)",
    "type": "<integer>",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   },
   {
    "name": "Lender Onboarding Date on PSB Platform",
    "path": "",
    "key": "lenderonboardingdate",
    "desc": "This is the onboaridng date of Lender on the PSB Platform Xchange",
    "type": "<date> - epoch",
    "mand": "Yes",
    "mandRule": "Yes",
    "mandKind": "always",
    "sample": "",
    "validation": ""
   }
  ]
 }
};
const PSB_MASTERS = {
 "leadTypes": [
  {
   "code": "CPL",
   "name": "Channel Partner Lead",
   "remarks": "This will be the type to be used to upload Channel Partner Leads (Delaer / Vendor Leads)"
  },
  {
   "code": "PGL",
   "name": "Program Lead",
   "remarks": "This will be the type to be used to upload new Anchor Leads (to be used for Program Leads for Dealer Finance / Vendor Finance & for products like Sales Invoice Discounting, Purchase Invoice Discounting, Factoring, Reverse Factoring and any other products offered"
  }
 ],
 "onboardingModes": [
  {
   "name": "Self",
   "remarks": "This option to be used if the Channel Partner will be completing the onboarding journey itself"
  },
  {
   "name": "Assisted",
   "remarks": "This option to be used if the Channel Partner will be completing the onboarding journey in an assisted mode (i.e Fintech Partner completing the journey on behalf of the Channel Partner)"
  }
 ],
 "products": [
  {
   "code": "DF",
   "name": "Dealer Finance"
  },
  {
   "code": "VF",
   "name": "Vendor Finance"
  },
  {
   "code": "SID",
   "name": "Sales Invoice Discounting"
  },
  {
   "code": "PID",
   "name": "Purchase Invoice Discounting"
  },
  {
   "code": "FACT",
   "name": "Factoring"
  },
  {
   "code": "REVFACT",
   "name": "Reverse Factoring"
  }
 ],
 "conduct": [
  {
   "code": "Satisfactory",
   "desc": "This is to be used if the conduct of the Anchor & Dealer for the last 12 months is satisfactory as on date"
  },
  {
   "code": "Unsatisfactory",
   "desc": "This is to be used if the conduct of the Anchor & Dealer for the last 12 months is unsatisfactory as on date"
  }
 ],
 "constitution": [
  {
   "code": "Sole Proprietorship",
   "desc": ""
  },
  {
   "code": "Hindu Undivided Family",
   "desc": ""
  },
  {
   "code": "Company",
   "desc": ""
  },
  {
   "code": "Firm",
   "desc": ""
  },
  {
   "code": "Association of Persons",
   "desc": ""
  },
  {
   "code": "Body of Individuals",
   "desc": ""
  },
  {
   "code": "Government Agency",
   "desc": ""
  },
  {
   "code": "Artificial Judicial Person",
   "desc": ""
  },
  {
   "code": "Local Authority",
   "desc": ""
  },
  {
   "code": "Trust",
   "desc": ""
  }
 ]
};
const PSB_STATUS_MASTER = {
 "fintech": [
  {
   "stage": "Lead",
   "status": "Draft",
   "desc": "Lead is uploaded by the Fintech via API OR via UI (Single or Bulk). The entity remains in Lead Dashboard until complete information is provided."
  },
  {
   "stage": "Opportunities",
   "status": "In Progress",
   "desc": "Once Lead upload is successful (data is completely filled), it is converted to Opportunity and the status is updated to In Progress. This also signifies that the action is on the Platform to execute the gating criteria and push it ahead."
  },
  {
   "stage": "Matches",
   "status": "Match Found",
   "desc": "If Opportunity passes the policy gating criteria for 1 or more Lender Product(s); it is converted to Match and the status is updated to Match Found"
  },
  {
   "stage": "Matches",
   "status": "No Match Found",
   "desc": "If Opportunity does not pass the policy gating criteria for any Lender(s); it is converted to Match and the status is updated to No Match Found"
  },
  {
   "stage": "Matches",
   "status": "Match Selected",
   "desc": "If the Customer/Fintech chooses 1 or more matches to proceed ahead, the status is updated to Match Selected"
  },
  {
   "stage": "Offers",
   "status": "Customer Rejected",
   "desc": "If the Customer/Fintech rejects 1 or more matches and decided not to proceed ahead, the status is updated to Customer Rejected"
  },
  {
   "stage": "Offers",
   "status": "Offers Awaited",
   "desc": "For the matches selected, customer/fintech completes the detailed journey and provides the required documents. Once Completed, the status is updated to Offer Awaited"
  },
  {
   "stage": "Offers",
   "status": "Offers Submitted",
   "desc": "Post review, once the Lender submits offer on the PSB Platform, the status is updated to Offer Submitted and the action is now on Customer/Fintech to approve/reject the same."
  },
  {
   "stage": "Offers",
   "status": "Lender Rejected",
   "desc": "Post review, if the Lender rejects the lead, the status is updated as Lender Rejected and the journey is completed"
  },
  {
   "stage": "Offers",
   "status": "Offer Accepted",
   "desc": "If the offer provided by the Lender is accepted by the Customer/Fintech, the status is updated to Offer Accepted."
  },
  {
   "stage": "Offers",
   "status": "Offer Rejected",
   "desc": "If the offer provided by the Lender is rejected by the Customer/Fintech, the status is updated to Offer Rejected."
  },
  {
   "stage": "Offers",
   "status": "Offer Expired",
   "desc": "If all the offers are in expired state, then the status is shown as expired state."
  },
  {
   "stage": "Program",
   "status": "Active",
   "desc": "If the Program is an Active Program"
  },
  {
   "stage": "Program",
   "status": "In Active",
   "desc": "If the Program is an In Active Program"
  }
 ],
 "lender": [
  {
   "stage": "Opportunities",
   "status": "In Progress",
   "desc": "Once Lead upload is successful (data is completely filled), it is converted to Opportunity and the status is updated to In Progress. This also signifies that the action is on the Platform to execute the gating criteria and push it ahead."
  },
  {
   "stage": "Matches",
   "status": "Lead Matched",
   "desc": "If the Lead passes the Policy Gating Criteria for 1 or more Product(s), the status is updated to Lead Matched"
  },
  {
   "stage": "Matches",
   "status": "Lead Not Matched",
   "desc": "If the Lead does not pass the Policy Gating Criteria for 1 or more Product(s), the status is updated to Lead Not Matched"
  },
  {
   "stage": "Matches",
   "status": "Match Selected",
   "desc": "Once Customer/Fitnech chooses a Lender match to proceed, the status is updated to Match Selected"
  },
  {
   "stage": "Matches",
   "status": "Match Not Selected",
   "desc": "If the Customer/Fitnech does not choose a Lender match to proceed, the status is updated to Match Not Selected. Here, the custoemr/fintech has not chosen the match - this is not the same as Rejection."
  },
  {
   "stage": "Offers",
   "status": "Customer Rejected",
   "desc": "If the Customer/Fitnech rejects a match (suggested by the PSB Platform), the status is updated to Customer Rejected"
  },
  {
   "stage": "Offers",
   "status": "Lead Not Matched",
   "desc": "NA"
  },
  {
   "stage": "Offers",
   "status": "Offers Awaited",
   "desc": "For the matches selected, customer/fintech completes the detailed journey and provides the required documents. Once Completed, the status is updated to Offer Awaited and the action is on Lender to review/underwrite the same"
  },
  {
   "stage": "Offers",
   "status": "Offers Submitted",
   "desc": "Post review, once the Lender submits offer on the PSB Platform, the status is updated to Offer Submitted"
  },
  {
   "stage": "Offers",
   "status": "Lender Rejected",
   "desc": "Post review, if the Lender rejects the lead, the status is updated as Lender Rejected and the journey is completed"
  },
  {
   "stage": "Offers",
   "status": "Offer Accepted",
   "desc": "If the offer provided by the Lender is accepted by the Customer/Fintech, the status is updated to Offer Accepted."
  },
  {
   "stage": "Offers",
   "status": "Offer Rejected",
   "desc": "If the offer provided by the Lender is rejected by the Customer/Fintech, the status is updated to Offer Accepted."
  },
  {
   "stage": "Offers",
   "status": "Offer Expired",
   "desc": "If the Offer is expired the status for the same will be reflected as Offer Expired. From the Offer expired state the Lead can move to Offer Submitted state or Offer Rejected state."
  },
  {
   "stage": "Program",
   "status": "Active",
   "desc": "If the Program is an Active Program"
  },
  {
   "stage": "Program",
   "status": "In Active",
   "desc": "If the Program is an In Active Program"
  }
 ]
};
const PSB_API_INDEX = [
 {
  "name": "Lead API",
  "desc": "This API is used by the Sourcing Partners to create Leads on the PSB Platform Xchange",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Get Status API",
  "desc": "This API will be exposed by the PSB Platform Xchange. This API will allow the Sourcing Partner to get latest status of Leads from the PSB Platform Xchange",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Status Callback",
  "desc": "This callback will be exposed by the Sourcing Partner to get Asynchronous status updates w.r.t to the Lead status from the PSB Platform",
  "type": "Callback",
  "exposedBy": "Sourcing Partner"
 },
 {
  "name": "Get Partnerships Details API",
  "desc": "This allows the Sourcing Partners to get the details of All/Active/In Active partnerships between the Lenders & Sourcing Partners on the PSB Platform Xchange",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Get Channel Partners for a Program API",
  "desc": "This allows the Sourcing Partner to get the details of All Channel Partners mapped to a particular program on PSB Platform Xchange",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Get Additional Lenders on PSB API",
  "desc": "This allows the Sourcing Partner to get the details of all Lenders onboarded on the PSB Platform Xchange and the corresponding status of partnership between the Lender & Sourcing Partner",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Transaction Initiate API",
  "desc": "This allows the Sourcing Partner to initiate the transaction for any Program/Channel Partner onboarded on the PSB Platform Xchange",
  "type": "API",
  "exposedBy": "PSB Platform Xchange"
 },
 {
  "name": "Transaction Status Callback",
  "desc": "This allows the Sourcing Partner to get the status of any transaction initiated for any Program/Channel Partner onboarded on the PSB Platfrom Xchange",
  "type": "Callback",
  "exposedBy": "Sourcing Partner"
 }
];
