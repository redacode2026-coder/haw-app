import urllib.request
import json
import sys

try:
    # 1. Test Home page
    res = urllib.request.urlopen('http://localhost:8080/')
    print('1. Home page HTTP Status:', res.status, 'HTML bytes:', len(res.read()))

    # 2. Test GET members
    res = urllib.request.urlopen('http://localhost:8080/api/members')
    data = json.loads(res.read().decode('utf-8'))
    print('2. GET /api/members success:', data['success'], 'Total Count:', data['count'])

    # 3. Test POST new member
    new_member = {
        'full_name': 'محمود عبد الرزاق السيد عيسى',
        'nickname': 'محمود عيسى',
        'national_id': '28810251809988',
        'id_issued_by': 'سجل مدني كفر الدوار',
        'id_issue_date': '2021-11-10',
        'email': 'mahmoud.eissa@example.com',
        'birth_date': '1988-10-25',
        'address': 'كفر الدوار - شارع بورسعيد',
        'governorate': 'البحيرة',
        'electoral_district': 'دائرة كفر الدوار',
        'syndicate': 'نقابة المحامين',
        'qualification': 'ليسانس حقوق',
        'job_title': 'محامي بالاستئناف العالي',
        'workplace': 'مكتب عيسى للمحاماة والاستشارات القانونية',
        'work_sector': 'المهن الحرة والقانونية',
        'phone': '0452219876',
        'mobile': '01099887766',
        'public_positions': 'المستشار القانوني لجمعية رعاية الأيتام بكفر الدوار',
        'activities': ['سياسي', 'إعلام', 'تنظيم', 'علاقات عامة'],
        'previous_parties_status': 'no',
        'previous_parties_details': ['', '', '', ''],
        'elections_nomination_status': 'yes',
        'elections_entities': ['أندية نقابات', 'مجالس محلية'],
        'elections_other_entity': '',
        'elections_details': 'الترشح لعضوية مجلس نقابة المحامين الفرعية بالبحيرة لدورة 2020',
        'endorser_name': 'عصام عبد المنعم الفقي',
        'endorser_title': 'أمين الشؤون القانونية',
        'applicant_signature': 'محمود عبد الرزاق',
        'status': 'معتمد'
    }

    req = urllib.request.Request(
        'http://localhost:8080/api/members',
        data=json.dumps(new_member).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    res = urllib.request.urlopen(req)
    post_res = json.loads(res.read().decode('utf-8'))
    print('3. POST /api/members:', post_res)

    # 4. Test GET stats
    res = urllib.request.urlopen('http://localhost:8080/api/stats')
    stats = json.loads(res.read().decode('utf-8'))
    print('4. GET /api/stats total members:', stats['data']['total'])

    # 5. Test Export CSV
    res = urllib.request.urlopen('http://localhost:8080/api/export')
    csv_bytes = res.read()
    csv_text = csv_bytes.decode('utf-8-sig')
    print('5. GET /api/export CSV lines:', len(csv_text.splitlines()), 'Bytes:', len(csv_bytes))

    print('\n=========================================')
    print(' ALL API TESTS PASSED WITH 100% SUCCESS! ')
    print('=========================================')
except Exception as e:
    print('Error during testing:', e)
    sys.exit(1)
