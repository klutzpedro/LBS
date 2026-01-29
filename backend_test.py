import requests
import sys
import time
from datetime import datetime

class NortharchAPITester:
    def __init__(self, base_url="https://mapdata-netra.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, passed, message="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
        
        result = {
            "test": test_name,
            "passed": passed,
            "message": message,
            "data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"\n{status} - {test_name}")
        if message:
            print(f"   {message}")
        if response_data and not passed:
            print(f"   Response: {response_data}")

    def run_test(self, name, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing: {name}")
        if description:
            print(f"   {description}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                try:
                    response_json = response.json()
                    self.log_result(name, True, f"Status: {response.status_code}", response_json)
                    return True, response_json
                except:
                    self.log_result(name, True, f"Status: {response.status_code}")
                    return True, {}
            else:
                try:
                    error_data = response.json()
                    self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}", error_data)
                except:
                    self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}", response.text)
                return False, {}

        except requests.exceptions.Timeout:
            self.log_result(name, False, "Request timed out")
            return False, {}
        except requests.exceptions.ConnectionError:
            self.log_result(name, False, "Connection error - backend may be down")
            return False, {}
        except Exception as e:
            self.log_result(name, False, f"Error: {str(e)}")
            return False, {}

    def test_login_success(self):
        """Test successful login"""
        success, response = self.run_test(
            "Login - Valid Credentials",
            "POST",
            "auth/login",
            200,
            data={"username": "admin", "password": "Paparoni83"},
            description="Testing login with admin/Paparoni83"
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   ✓ Token received: {self.token[:20]}...")
            return True
        return False

    def test_login_failure(self):
        """Test login with invalid credentials"""
        success, response = self.run_test(
            "Login - Invalid Credentials",
            "POST",
            "auth/login",
            401,
            data={"username": "wrong", "password": "wrong"},
            description="Testing login with wrong credentials (should fail)"
        )
        return success

    def test_get_stats(self):
        """Test dashboard stats endpoint"""
        success, response = self.run_test(
            "Get Dashboard Stats",
            "GET",
            "stats",
            200,
            description="Fetching dashboard statistics"
        )
        if success:
            required_fields = ['total_cases', 'active_cases', 'total_targets', 'success_rate']
            missing_fields = [f for f in required_fields if f not in response]
            if missing_fields:
                print(f"   ⚠️  Missing fields: {missing_fields}")
                return False
            print(f"   ✓ Stats: {response}")
        return success

    def test_create_case(self):
        """Test creating a new case"""
        case_name = f"Test Case {datetime.now().strftime('%Y%m%d_%H%M%S')}"
        success, response = self.run_test(
            "Create Case",
            "POST",
            "cases",
            200,
            data={
                "name": case_name,
                "description": "Automated test case"
            },
            description=f"Creating case: {case_name}"
        )
        if success and 'id' in response:
            print(f"   ✓ Case created with ID: {response['id']}")
            return response['id']
        return None

    def test_get_cases(self):
        """Test fetching all cases"""
        success, response = self.run_test(
            "Get All Cases",
            "GET",
            "cases",
            200,
            description="Fetching all cases"
        )
        if success:
            print(f"   ✓ Found {len(response)} cases")
        return success, response

    def test_get_case_by_id(self, case_id):
        """Test fetching a specific case"""
        success, response = self.run_test(
            "Get Case by ID",
            "GET",
            f"cases/{case_id}",
            200,
            description=f"Fetching case {case_id}"
        )
        return success

    def test_create_target(self, case_id):
        """Test creating a target"""
        phone_number = "628123456789"
        success, response = self.run_test(
            "Create Target",
            "POST",
            "targets",
            200,
            data={
                "case_id": case_id,
                "phone_number": phone_number
            },
            description=f"Creating target with phone: {phone_number}"
        )
        if success and 'id' in response:
            print(f"   ✓ Target created with ID: {response['id']}")
            return response['id']
        return None

    def test_create_target_invalid_phone(self, case_id):
        """Test creating target with invalid phone number"""
        success, response = self.run_test(
            "Create Target - Invalid Phone",
            "POST",
            "targets",
            400,
            data={
                "case_id": case_id,
                "phone_number": "123456789"  # Invalid - doesn't start with 62
            },
            description="Testing with invalid phone number (should fail)"
        )
        return success

    def test_get_targets(self):
        """Test fetching all targets"""
        success, response = self.run_test(
            "Get All Targets",
            "GET",
            "targets",
            200,
            description="Fetching all targets"
        )
        if success:
            print(f"   ✓ Found {len(response)} targets")
        return success, response

    def test_get_target_by_id(self, target_id):
        """Test fetching a specific target"""
        success, response = self.run_test(
            "Get Target by ID",
            "GET",
            f"targets/{target_id}",
            200,
            description=f"Fetching target {target_id}"
        )
        return success, response

    def test_target_status_polling(self, target_id, max_wait=15):
        """Test target status polling until completion"""
        print(f"\n🔄 Polling target status (max {max_wait}s)...")
        start_time = time.time()
        last_status = None
        
        while time.time() - start_time < max_wait:
            success, response = self.run_test(
                f"Get Target Status - {target_id[:8]}",
                "GET",
                f"targets/{target_id}/status",
                200,
                description="Checking target query status"
            )
            
            if not success:
                return False
            
            status = response.get('status', 'unknown')
            if status != last_status:
                print(f"   📍 Status: {status} - {response.get('message', '')}")
                last_status = status
            
            if status in ['completed', 'error']:
                if status == 'completed':
                    print(f"   ✅ Query completed successfully!")
                    if response.get('data'):
                        data = response['data']
                        print(f"   📍 Location: {data.get('latitude')}, {data.get('longitude')}")
                        print(f"   📍 Address: {data.get('address')}")
                    return True
                else:
                    print(f"   ❌ Query failed with error")
                    return False
            
            time.sleep(2)
        
        print(f"   ⚠️  Timeout waiting for completion (last status: {last_status})")
        return False

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print("="*60)
        
        if self.tests_run - self.tests_passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['message']}")
        
        return self.tests_passed == self.tests_run

def main():
    print("="*60)
    print("NORTHARCH GIS INTELLIGENCE SYSTEM - API TESTING")
    print("="*60)
    
    tester = NortharchAPITester()
    
    # Test 1: Login with valid credentials
    if not tester.test_login_success():
        print("\n❌ CRITICAL: Login failed. Cannot proceed with other tests.")
        tester.print_summary()
        return 1
    
    # Test 2: Login with invalid credentials
    tester.test_login_failure()
    
    # Test 3: Get dashboard stats
    tester.test_get_stats()
    
    # Test 4: Create a case
    case_id = tester.test_create_case()
    if not case_id:
        print("\n❌ CRITICAL: Case creation failed. Cannot test targets.")
        tester.print_summary()
        return 1
    
    # Test 5: Get all cases
    tester.test_get_cases()
    
    # Test 6: Get case by ID
    tester.test_get_case_by_id(case_id)
    
    # Test 7: Create target with invalid phone
    tester.test_create_target_invalid_phone(case_id)
    
    # Test 8: Create target with valid phone
    target_id = tester.test_create_target(case_id)
    if not target_id:
        print("\n❌ CRITICAL: Target creation failed.")
        tester.print_summary()
        return 1
    
    # Test 9: Get all targets
    tester.test_get_targets()
    
    # Test 10: Get target by ID
    tester.test_get_target_by_id(target_id)
    
    # Test 11: Poll target status until completion
    tester.test_target_status_polling(target_id, max_wait=15)
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
