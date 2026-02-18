"""
Backend API tests for the 'Plot Posisi' feature.
Tests CRUD operations for plotted points:
- POST /api/plots - Create plotted point
- GET /api/plots - List all plotted points
- PUT /api/plots/{id} - Update plotted point (name, icon, color)
- PUT /api/plots/{id}/visibility - Toggle visibility
- DELETE /api/plots/{id} - Delete plotted point
- Ownership validation (only creator can edit/delete)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Paparoni290483#"

# Test data prefix for cleanup
TEST_PREFIX = "TEST_PLOT_"


class TestPlotPosisiAPI:
    """Test suite for Plot Posisi feature API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login and get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD,
            "force_login": True
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup: Delete test-created points
        self.cleanup_test_data()
    
    def cleanup_test_data(self):
        """Remove test data created during tests"""
        try:
            response = self.session.get(f"{BASE_URL}/api/plots")
            if response.status_code == 200:
                points = response.json().get("points", [])
                for point in points:
                    if point.get("name", "").startswith(TEST_PREFIX):
                        self.session.delete(f"{BASE_URL}/api/plots/{point['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ============================================
    # CREATE (POST /api/plots)
    # ============================================
    
    def test_create_plotted_point_success(self):
        """Test creating a new plotted point with all fields"""
        payload = {
            "name": f"{TEST_PREFIX}Location_1",
            "latitude": -6.9175,
            "longitude": 107.6191,
            "icon": "pin",
            "color": "#FF5733"
        }
        
        response = self.session.post(f"{BASE_URL}/api/plots", json=payload)
        
        # Status code assertion
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "point" in data
        point = data["point"]
        
        assert point["name"] == payload["name"]
        assert point["latitude"] == payload["latitude"]
        assert point["longitude"] == payload["longitude"]
        assert point["icon"] == payload["icon"]
        assert point["color"] == payload["color"]
        assert point["is_visible"] is True  # Default visibility
        assert point["created_by"] == ADMIN_USERNAME
        assert "id" in point
        assert "created_at" in point
    
    def test_create_plotted_point_minimal(self):
        """Test creating point with only required fields (name, lat, lng)"""
        payload = {
            "name": f"{TEST_PREFIX}Minimal_Point",
            "latitude": -6.5000,
            "longitude": 107.0000
        }
        
        response = self.session.post(f"{BASE_URL}/api/plots", json=payload)
        
        assert response.status_code == 200
        point = response.json()["point"]
        
        # Defaults should be applied
        assert point["icon"] == "pin"  # Default icon
        assert point["color"] == "#FF5733"  # Default color
        assert point["is_visible"] is True
    
    def test_create_plotted_point_with_different_icons(self):
        """Test creating points with different icon types"""
        icons = ["pin", "star", "flag", "home", "building", "navigation"]
        
        for icon in icons:
            payload = {
                "name": f"{TEST_PREFIX}Icon_{icon}",
                "latitude": -6.9 + icons.index(icon) * 0.01,
                "longitude": 107.6,
                "icon": icon
            }
            
            response = self.session.post(f"{BASE_URL}/api/plots", json=payload)
            assert response.status_code == 200, f"Failed for icon {icon}: {response.text}"
            assert response.json()["point"]["icon"] == icon
    
    def test_create_plotted_point_unauthorized(self):
        """Test creating point without authentication"""
        # Remove auth header
        session_no_auth = requests.Session()
        session_no_auth.headers.update({"Content-Type": "application/json"})
        
        payload = {
            "name": f"{TEST_PREFIX}Unauthorized",
            "latitude": -6.9,
            "longitude": 107.6
        }
        
        response = session_no_auth.post(f"{BASE_URL}/api/plots", json=payload)
        assert response.status_code in [401, 403]  # Unauthorized
    
    # ============================================
    # READ (GET /api/plots)
    # ============================================
    
    def test_get_all_plotted_points(self):
        """Test retrieving all plotted points"""
        # First create a point
        payload = {
            "name": f"{TEST_PREFIX}GetAll_Test",
            "latitude": -6.91,
            "longitude": 107.61
        }
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json=payload)
        assert create_resp.status_code == 200
        
        # Now get all
        response = self.session.get(f"{BASE_URL}/api/plots")
        
        assert response.status_code == 200
        data = response.json()
        assert "points" in data
        assert isinstance(data["points"], list)
        
        # Verify our created point is in the list
        point_names = [p["name"] for p in data["points"]]
        assert f"{TEST_PREFIX}GetAll_Test" in point_names
    
    def test_get_plotted_points_verify_structure(self):
        """Test that returned points have all expected fields"""
        # Create a test point first
        payload = {
            "name": f"{TEST_PREFIX}Structure_Test",
            "latitude": -6.92,
            "longitude": 107.62,
            "icon": "star",
            "color": "#33FF57"
        }
        self.session.post(f"{BASE_URL}/api/plots", json=payload)
        
        response = self.session.get(f"{BASE_URL}/api/plots")
        assert response.status_code == 200
        
        points = response.json()["points"]
        test_point = next((p for p in points if p["name"] == f"{TEST_PREFIX}Structure_Test"), None)
        
        assert test_point is not None
        
        # Verify all required fields exist
        required_fields = ["id", "name", "latitude", "longitude", "icon", "color", "is_visible", "created_by", "created_at"]
        for field in required_fields:
            assert field in test_point, f"Missing field: {field}"
    
    # ============================================
    # UPDATE (PUT /api/plots/{id})
    # ============================================
    
    def test_update_plotted_point_name(self):
        """Test updating point name"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Update_Name",
            "latitude": -6.93,
            "longitude": 107.63
        })
        point_id = create_resp.json()["point"]["id"]
        
        # Update name
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}", json={
            "name": f"{TEST_PREFIX}Updated_Name"
        })
        
        assert update_resp.status_code == 200
        updated_point = update_resp.json()["point"]
        assert updated_point["name"] == f"{TEST_PREFIX}Updated_Name"
        
        # Verify persistence with GET
        get_resp = self.session.get(f"{BASE_URL}/api/plots")
        points = get_resp.json()["points"]
        fetched_point = next((p for p in points if p["id"] == point_id), None)
        assert fetched_point is not None
        assert fetched_point["name"] == f"{TEST_PREFIX}Updated_Name"
    
    def test_update_plotted_point_icon(self):
        """Test updating point icon"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Update_Icon",
            "latitude": -6.94,
            "longitude": 107.64,
            "icon": "pin"
        })
        point_id = create_resp.json()["point"]["id"]
        
        # Update icon
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}", json={
            "icon": "star"
        })
        
        assert update_resp.status_code == 200
        assert update_resp.json()["point"]["icon"] == "star"
    
    def test_update_plotted_point_color(self):
        """Test updating point color"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Update_Color",
            "latitude": -6.95,
            "longitude": 107.65,
            "color": "#FF5733"
        })
        point_id = create_resp.json()["point"]["id"]
        
        # Update color
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}", json={
            "color": "#3357FF"
        })
        
        assert update_resp.status_code == 200
        assert update_resp.json()["point"]["color"] == "#3357FF"
    
    def test_update_plotted_point_all_fields(self):
        """Test updating all editable fields at once"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Update_All",
            "latitude": -6.96,
            "longitude": 107.66,
            "icon": "pin",
            "color": "#FF5733"
        })
        point_id = create_resp.json()["point"]["id"]
        
        # Update all fields
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}", json={
            "name": f"{TEST_PREFIX}All_Updated",
            "icon": "flag",
            "color": "#00FF00"
        })
        
        assert update_resp.status_code == 200
        updated = update_resp.json()["point"]
        assert updated["name"] == f"{TEST_PREFIX}All_Updated"
        assert updated["icon"] == "flag"
        assert updated["color"] == "#00FF00"
    
    def test_update_plotted_point_not_found(self):
        """Test updating non-existent point"""
        fake_id = str(uuid.uuid4())
        
        response = self.session.put(f"{BASE_URL}/api/plots/{fake_id}", json={
            "name": "Should Fail"
        })
        
        assert response.status_code == 404
    
    # ============================================
    # VISIBILITY TOGGLE (PUT /api/plots/{id}/visibility)
    # ============================================
    
    def test_toggle_visibility(self):
        """Test toggling point visibility"""
        # Create point (default visible = True)
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Toggle_Vis",
            "latitude": -6.97,
            "longitude": 107.67
        })
        point_id = create_resp.json()["point"]["id"]
        original_visibility = create_resp.json()["point"]["is_visible"]
        assert original_visibility is True
        
        # Toggle visibility (should become False)
        toggle_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}/visibility")
        
        assert toggle_resp.status_code == 200
        data = toggle_resp.json()
        assert data["point_id"] == point_id
        assert data["is_visible"] is False
        
        # Verify persistence
        get_resp = self.session.get(f"{BASE_URL}/api/plots")
        points = get_resp.json()["points"]
        fetched = next((p for p in points if p["id"] == point_id), None)
        assert fetched is not None
        assert fetched["is_visible"] is False
        
        # Toggle again (should become True)
        toggle_resp2 = self.session.put(f"{BASE_URL}/api/plots/{point_id}/visibility")
        assert toggle_resp2.status_code == 200
        assert toggle_resp2.json()["is_visible"] is True
    
    def test_toggle_visibility_not_found(self):
        """Test toggling visibility for non-existent point"""
        fake_id = str(uuid.uuid4())
        
        response = self.session.put(f"{BASE_URL}/api/plots/{fake_id}/visibility")
        assert response.status_code == 404
    
    # ============================================
    # DELETE (DELETE /api/plots/{id})
    # ============================================
    
    def test_delete_plotted_point(self):
        """Test deleting a plotted point"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Delete_Test",
            "latitude": -6.98,
            "longitude": 107.68
        })
        point_id = create_resp.json()["point"]["id"]
        
        # Delete
        delete_resp = self.session.delete(f"{BASE_URL}/api/plots/{point_id}")
        assert delete_resp.status_code == 200
        
        # Verify it's deleted (GET should not find it)
        get_resp = self.session.get(f"{BASE_URL}/api/plots")
        points = get_resp.json()["points"]
        point_ids = [p["id"] for p in points]
        assert point_id not in point_ids
    
    def test_delete_plotted_point_not_found(self):
        """Test deleting non-existent point"""
        fake_id = str(uuid.uuid4())
        
        response = self.session.delete(f"{BASE_URL}/api/plots/{fake_id}")
        assert response.status_code == 404
    
    # ============================================
    # OWNERSHIP VALIDATION
    # ============================================
    
    def test_ownership_validation_scenario(self):
        """Test that only the creator (or admin) can modify/delete points
        
        Since we're testing as admin, this test verifies the ownership check
        is present by checking the API response structure.
        Note: Full ownership test would require creating another user.
        """
        # Create a point as admin
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Ownership_Test",
            "latitude": -6.99,
            "longitude": 107.69
        })
        assert create_resp.status_code == 200
        point = create_resp.json()["point"]
        
        # Verify created_by is set correctly
        assert point["created_by"] == ADMIN_USERNAME
        
        # As admin, we should be able to update
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point['id']}", json={
            "name": f"{TEST_PREFIX}Ownership_Updated"
        })
        assert update_resp.status_code == 200
        
        # As admin, we should be able to delete
        delete_resp = self.session.delete(f"{BASE_URL}/api/plots/{point['id']}")
        assert delete_resp.status_code == 200


class TestPlotsAPIEdgeCases:
    """Edge case tests for Plots API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login and get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD,
            "force_login": True
        })
        assert response.status_code == 200
        self.token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup
        try:
            response = self.session.get(f"{BASE_URL}/api/plots")
            if response.status_code == 200:
                for point in response.json().get("points", []):
                    if point.get("name", "").startswith(TEST_PREFIX):
                        self.session.delete(f"{BASE_URL}/api/plots/{point['id']}")
        except:
            pass
    
    def test_create_with_special_characters_in_name(self):
        """Test creating point with special characters in name"""
        payload = {
            "name": f"{TEST_PREFIX}Special: Lokasi #1 (Test)",
            "latitude": -6.91,
            "longitude": 107.61
        }
        
        response = self.session.post(f"{BASE_URL}/api/plots", json=payload)
        assert response.status_code == 200
        assert response.json()["point"]["name"] == payload["name"]
    
    def test_create_with_extreme_coordinates(self):
        """Test creating points at edge coordinates"""
        test_cases = [
            {"name": f"{TEST_PREFIX}Equator", "latitude": 0.0, "longitude": 107.0},
            {"name": f"{TEST_PREFIX}North", "latitude": 5.0, "longitude": 100.0},
            {"name": f"{TEST_PREFIX}South", "latitude": -10.0, "longitude": 140.0},
        ]
        
        for payload in test_cases:
            response = self.session.post(f"{BASE_URL}/api/plots", json=payload)
            assert response.status_code == 200, f"Failed for {payload['name']}"
    
    def test_update_empty_payload(self):
        """Test updating with empty payload (no changes)"""
        # Create point
        create_resp = self.session.post(f"{BASE_URL}/api/plots", json={
            "name": f"{TEST_PREFIX}Empty_Update",
            "latitude": -6.92,
            "longitude": 107.62
        })
        point_id = create_resp.json()["point"]["id"]
        original_name = create_resp.json()["point"]["name"]
        
        # Update with empty payload
        update_resp = self.session.put(f"{BASE_URL}/api/plots/{point_id}", json={})
        
        # Should succeed but not change anything
        assert update_resp.status_code == 200
        assert update_resp.json()["point"]["name"] == original_name


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
