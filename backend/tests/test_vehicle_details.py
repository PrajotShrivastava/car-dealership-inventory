"""Condition, mileage, colour, VIN and features: stored, validated, searchable and filterable."""

import pytest

from tests.conftest import VEHICLE
from tests.test_vehicle_ownership import MINE, OTHER, add, dealer

VIN = "1HGCM82633A004352"


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


@pytest.fixture
def other(client):
    return dealer(client, OTHER)


def create(client, headers, **fields):
    return client.post("/api/vehicles", json={**VEHICLE, **fields}, headers=headers)


def editable(vehicle):
    return {
        k: v
        for k, v in vehicle.items()
        if k not in ("id", "quantity", "photos", "accepts_enquiries")
    }


def search(client, headers, **params):
    response = client.get("/api/vehicles/search", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def models(body):
    return [v["model"] for v in body["items"]]


class TestStoring:
    def test_defaults_for_a_vehicle_without_details(self, client, mine):
        vehicle = add(client, mine)

        assert vehicle["condition"] == "new"
        assert vehicle["mileage"] is None
        assert vehicle["colour"] is None
        assert vehicle["vin"] is None
        assert vehicle["features"] == []

    def test_stores_every_detail(self, client, mine, customer_headers):
        vehicle = add(
            client,
            mine,
            quantity=1,
            condition="used",
            mileage=42_150,
            colour="Midnight Blue",
            vin=VIN,
            features=["Sunroof", "Apple CarPlay"],
        )

        body = client.get(f"/api/vehicles/{vehicle['id']}", headers=customer_headers).json()
        assert body["condition"] == "used"
        assert body["mileage"] == 42_150
        assert body["colour"] == "Midnight Blue"
        assert body["vin"] == VIN
        assert body["features"] == ["Sunroof", "Apple CarPlay"]

    def test_tidies_the_vin_and_features(self, client, mine):
        vehicle = add(
            client,
            mine,
            quantity=1,
            vin=" 1hgcm8-2633 a004352 ",
            colour="  ",
            features=["Sunroof", " sunroof ", "", "Heated seats"],
        )

        assert vehicle["vin"] == VIN
        assert vehicle["colour"] is None
        assert vehicle["features"] == ["Sunroof", "Heated seats"]

    def test_editing_changes_and_clears_details(self, client, mine):
        vehicle = add(client, mine, quantity=1, colour="Red", vin=VIN, features=["Sunroof"])

        response = client.put(
            f"/api/vehicles/{vehicle['id']}",
            json={
                **editable(vehicle),
                "condition": "certified",
                "mileage": 12_000,
                "colour": None,
                "vin": "",
                "features": [],
            },
            headers=mine,
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert (body["condition"], body["mileage"], body["colour"], body["vin"]) == (
            "certified",
            12_000,
            None,
            None,
        )
        assert body["features"] == []


class TestValidation:
    @pytest.mark.parametrize(
        "fields",
        [
            {"condition": "salvage"},
            {"condition": "used"},  # used cars need a mileage
            {"condition": "certified", "mileage": None},
            {"mileage": -1},
            {"mileage": 2_000_001},
            {"colour": "x" * 31},
            {"vin": "SHORT"},
            {"vin": "1HGCM82633A00435O"},  # O is never used in a VIN
            {"vin": "1HGCM82633A0043521"},
            {"features": ["x" * 41]},
            {"features": [f"Feature {n}" for n in range(31)]},
        ],
    )
    def test_rejects_invalid_details(self, client, mine, fields):
        assert create(client, mine, quantity=1, **fields).status_code == 422

    def test_a_new_car_may_have_delivery_miles(self, client, mine):
        assert create(client, mine, condition="new", mileage=12).status_code == 201


class TestVin:
    def test_a_car_with_a_vin_is_a_single_unit(self, client, mine):
        response = create(client, mine, vin=VIN, quantity=2)

        assert response.status_code == 422

    def test_it_cannot_be_restocked_past_one(self, client, mine):
        vehicle = add(client, mine, vin=VIN, quantity=1)

        response = client.post(
            f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 1}, headers=mine
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VIN_SINGLE_UNIT"

    def test_once_sold_it_can_be_restocked_to_one(self, client, mine):
        vehicle = add(client, mine, vin=VIN, quantity=0)

        response = client.post(
            f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 1}, headers=mine
        )

        assert response.status_code == 200
        assert response.json()["quantity"] == 1

    def test_a_vin_cannot_be_added_to_a_listing_with_several_units(self, client, mine):
        vehicle = add(client, mine, quantity=3)

        response = client.put(
            f"/api/vehicles/{vehicle['id']}", json={**editable(vehicle), "vin": VIN}, headers=mine
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VIN_SINGLE_UNIT"

    def test_a_dealer_cannot_list_the_same_vin_twice(self, client, mine):
        add(client, mine, vin=VIN, quantity=1)

        response = create(client, mine, vin=VIN.lower(), quantity=1)

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VIN_TAKEN"

    def test_editing_onto_another_listings_vin_is_refused(self, client, mine):
        add(client, mine, vin=VIN, quantity=1)
        second = add(client, mine, quantity=1)

        response = client.put(
            f"/api/vehicles/{second['id']}", json={**editable(second), "vin": VIN}, headers=mine
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VIN_TAKEN"

    def test_different_dealers_keep_separate_inventories(self, client, mine, other):
        add(client, mine, vin=VIN, quantity=1)

        assert create(client, other, vin=VIN, quantity=1).status_code == 201

    def test_admin_added_vehicles_share_one_inventory(self, client, admin_headers):
        assert create(client, admin_headers, vin=VIN, quantity=1).status_code == 201

        assert create(client, admin_headers, vin=VIN, quantity=1).status_code == 409


class TestSearching:
    @pytest.fixture
    def stock(self, client, mine):
        add(client, mine, model="Fresh", condition="new")
        add(client, mine, model="Low", condition="used", mileage=18_000, colour="Pearl White")
        add(
            client,
            mine,
            model="High",
            condition="certified",
            mileage=96_000,
            features=["Panoramic roof"],
        )
        add(client, mine, model="Tagged", quantity=1, vin=VIN)

    def test_filters_by_condition(self, client, customer_headers, stock):
        body = search(client, customer_headers, condition="used")

        assert models(body) == ["Low"]
        assert body["counts"]["all"] == 1

    def test_filters_by_maximum_mileage_counting_new_cars_as_zero(
        self, client, customer_headers, stock
    ):
        assert sorted(models(search(client, customer_headers, max_mileage=20_000))) == [
            "Fresh",
            "Low",
            "Tagged",
        ]

    def test_sorts_by_mileage(self, client, customer_headers, stock):
        assert models(search(client, customer_headers, sort="mileage_asc"))[-2:] == [
            "Low",
            "High",
        ]

    @pytest.mark.parametrize(
        ("q", "expected"), [("pearl", "Low"), ("panoramic", "High"), ("A004352", "Tagged")]
    )
    def test_text_search_covers_colour_features_and_vin(
        self, client, customer_headers, stock, q, expected
    ):
        assert models(search(client, customer_headers, q=q)) == [expected]

    @pytest.mark.parametrize(
        "params", [{"condition": "salvage"}, {"max_mileage": -1}, {"sort": "mileage_desc"}]
    )
    def test_rejects_invalid_filters(self, client, customer_headers, params):
        response = client.get("/api/vehicles/search", params=params, headers=customer_headers)

        assert response.status_code == 422
