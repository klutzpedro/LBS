"""
Test Social Network Analytics (SNA) API Endpoints
Tests the POST /api/nongeoint/social-network-analytics and GET /api/nongeoint/social-network-analytics/{sna_id} endpoints
"""

import pytest
import requests
import os
import time

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSNAEndpoints:
    """Test Social Network Analytics API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "Paparoni290483#",
            "force_login": True  # Force logout other sessions
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        assert token, "No token in login response"
        return token
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get authenticated headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_login_success(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "Paparoni290483#",
            "force_login": True  # Force logout other sessions
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        print(f"✓ Login successful for user: {data['user'].get('username')}")
    
    def test_sna_endpoint_exists_post(self, headers):
        """Test POST /api/nongeoint/social-network-analytics endpoint exists"""
        # Test with minimal data - we expect 422 (validation error) or 400 (bad request)
        # rather than 404 (not found) - which proves endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/social-network-analytics",
            headers=headers,
            json={}
        )
        
        # 422 = endpoint exists but validation failed (expected - we sent empty body)
        # 400 = endpoint exists but bad request
        # We do NOT want 404 (endpoint not found) or 405 (method not allowed)
        assert response.status_code in [400, 422], \
            f"Expected 400/422 (endpoint exists), got {response.status_code}: {response.text}"
        print(f"✓ POST SNA endpoint exists (status: {response.status_code})")
    
    def test_sna_endpoint_exists_get(self, headers):
        """Test GET /api/nongeoint/social-network-analytics/{sna_id} endpoint exists"""
        # Test with a fake ID - we expect 404 (SNA not found) not 404 (route not found)
        test_id = "test123"
        response = requests.get(
            f"{BASE_URL}/api/nongeoint/social-network-analytics/{test_id}",
            headers=headers
        )
        
        # 404 with "SNA not found" = endpoint exists
        # 405 = route exists but wrong method
        assert response.status_code == 404, \
            f"Expected 404 for non-existent SNA, got {response.status_code}"
        
        data = response.json()
        # Check if error message mentions SNA not found (proves endpoint works)
        assert "SNA not found" in str(data) or "not found" in str(data).lower(), \
            f"Unexpected error response: {data}"
        print(f"✓ GET SNA endpoint exists (status: {response.status_code})")
    
    def test_sna_requires_authentication(self):
        """Test SNA endpoints require authentication"""
        # Test POST without auth
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/social-network-analytics",
            json={"search_id": "test", "nik": "1234", "name": "Test"}
        )
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✓ POST SNA requires authentication")
        
        # Test GET without auth
        response = requests.get(
            f"{BASE_URL}/api/nongeoint/social-network-analytics/test123"
        )
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✓ GET SNA requires authentication")
    
    def test_sna_post_validation(self, headers):
        """Test SNA POST endpoint validates required fields"""
        # Missing required fields
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/social-network-analytics",
            headers=headers,
            json={"search_id": "test123"}  # Missing nik and name
        )
        
        assert response.status_code == 422, \
            f"Expected 422 for missing fields, got {response.status_code}"
        print(f"✓ SNA validates required fields")
    
    def test_sna_post_full_request(self, headers):
        """Test SNA POST with full valid request (but fake data)"""
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/social-network-analytics",
            headers=headers,
            json={
                "search_id": "test_search_123",
                "nik": "1234567890123456",
                "name": "Test User",
                "social_media": []  # Empty array is valid
            }
        )
        
        # Should return 200 with sna_id since all fields are valid
        # Even though there's no actual search, the endpoint should accept the request
        assert response.status_code == 200, \
            f"Expected 200 for valid SNA request, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "sna_id" in data, f"Expected sna_id in response: {data}"
        assert "status" in data, f"Expected status in response: {data}"
        
        sna_id = data.get("sna_id")
        print(f"✓ SNA started successfully with ID: {sna_id}")
        
        # Verify we can fetch the SNA result
        time.sleep(1)  # Brief wait for processing
        
        get_response = requests.get(
            f"{BASE_URL}/api/nongeoint/social-network-analytics/{sna_id}",
            headers=headers
        )
        
        assert get_response.status_code == 200, \
            f"Expected 200 when fetching SNA, got {get_response.status_code}"
        
        sna_data = get_response.json()
        assert sna_data.get("id") == sna_id, f"SNA ID mismatch"
        assert "status" in sna_data, "Missing status in SNA data"
        print(f"✓ SNA data retrieved successfully, status: {sna_data.get('status')}")


class TestOsintEndpoints:
    """Test FAKTA OSINT API endpoints (dependency for SNA)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "Paparoni290483#",
            "force_login": True  # Force logout other sessions
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get authenticated headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_osint_endpoint_exists(self, headers):
        """Test POST /api/nongeoint/fakta-osint endpoint exists"""
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/fakta-osint",
            headers=headers,
            json={}
        )
        
        # 422 or 400 = endpoint exists
        assert response.status_code in [400, 422], \
            f"Expected 400/422, got {response.status_code}"
        print(f"✓ FAKTA OSINT endpoint exists")
    
    def test_osint_get_endpoint_exists(self, headers):
        """Test GET /api/nongeoint/fakta-osint/{osint_id} endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/nongeoint/fakta-osint/test123",
            headers=headers
        )
        
        assert response.status_code == 404, \
            f"Expected 404 for non-existent OSINT, got {response.status_code}"
        print(f"✓ FAKTA OSINT GET endpoint exists")


class TestNonGeointSearch:
    """Test NonGeoint Search API endpoints (base for all advanced features)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "Paparoni290483#"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get authenticated headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_search_endpoint_exists(self, headers):
        """Test POST /api/nongeoint/search endpoint exists"""
        response = requests.post(
            f"{BASE_URL}/api/nongeoint/search",
            headers=headers,
            json={"name": "test"}
        )
        
        # We expect success or error related to processing - not 404
        assert response.status_code != 404, \
            f"Search endpoint not found: {response.status_code}"
        print(f"✓ NonGeoint search endpoint exists (status: {response.status_code})")
    
    def test_searches_list_endpoint(self, headers):
        """Test GET /api/nongeoint/searches endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/nongeoint/searches",
            headers=headers
        )
        
        assert response.status_code == 200, \
            f"Expected 200 for searches list, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list of searches, got {type(data)}"
        print(f"✓ Searches list endpoint works, found {len(data)} searches")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
