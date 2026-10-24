import pytest


@pytest.fixture
def inventory(make_vehicle):
    return {
        "kuga": make_vehicle(
            make="Ford", model="Kuga", trim="Titanium", category="suv", price="35990", quantity=4
        ),
        "fiesta": make_vehicle(
            make="Ford", model="Fiesta", trim="ST", category="hatchback", price="18500", quantity=0
        ),
        "duster": make_vehicle(
            make="Dacia",
            model="Duster",
            trim="Adventure",
            category="suv",
            price="19990",
            quantity=2,
        ),
        "zoe": make_vehicle(
            make="Renault",
            model="Zoe",
            category="hatchback",
            fuel_type="electric",
            price="24990",
            year=2021,
            quantity=0,
        ),
        "model3": make_vehicle(
            make="Tesla", model="Model 3", category="sedan", price="42990.50", quantity=7
        ),
    }


def search(client, headers, path="/api/vehicles/search", **params):
    response = client.get(path, params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def ids(body):
    return {v["id"] for v in body["items"]}


class TestFiltering:
    def test_search_requires_authentication(self, client):
        assert client.get("/api/vehicles/search").status_code == 401

    def test_no_filters_returns_everything(self, client, customer_headers, inventory):
        body = search(client, customer_headers)

        assert body["total"] == 5
        assert ids(body) == {v["id"] for v in inventory.values()}

    def test_free_text_matches_make_model_or_trim_case_insensitively(
        self, client, customer_headers, inventory
    ):
        assert ids(search(client, customer_headers, q="ford")) == {
            inventory["kuga"]["id"],
            inventory["fiesta"]["id"],
        }
        assert ids(search(client, customer_headers, q="adventure")) == {inventory["duster"]["id"]}
        assert ids(search(client, customer_headers, q="ford st")) == {inventory["fiesta"]["id"]}

    def test_free_text_treats_like_wildcards_literally(self, client, customer_headers, inventory):
        assert search(client, customer_headers, q="%")["total"] == 0
        assert search(client, customer_headers, q="_")["total"] == 0

    def test_filters_by_make_and_model(self, client, customer_headers, inventory):
        assert ids(search(client, customer_headers, make="FORD", model="kuga")) == {
            inventory["kuga"]["id"]
        }

    def test_filters_by_category(self, client, customer_headers, inventory):
        assert ids(search(client, customer_headers, category="suv")) == {
            inventory["kuga"]["id"],
            inventory["duster"]["id"],
        }

    def test_filters_by_inclusive_price_range(self, client, customer_headers, inventory):
        body = search(client, customer_headers, min_price="19990", max_price="35990")

        assert ids(body) == {
            inventory["kuga"]["id"],
            inventory["duster"]["id"],
            inventory["zoe"]["id"],
        }

    def test_filters_by_availability(self, client, customer_headers, inventory):
        in_stock = search(client, customer_headers, availability="in_stock")
        out_of_stock = search(client, customer_headers, availability="out_of_stock")

        assert ids(out_of_stock) == {inventory["fiesta"]["id"], inventory["zoe"]["id"]}
        assert len(ids(in_stock)) == 3

    def test_combines_filters(self, client, customer_headers, inventory):
        body = search(client, customer_headers, category="hatchback", availability="in_stock")

        assert body["items"] == []
        assert body["total"] == 0

    def test_list_endpoint_accepts_the_same_filters(self, client, customer_headers, inventory):
        body = search(client, customer_headers, path="/api/vehicles", category="sedan")

        assert ids(body) == {inventory["model3"]["id"]}


class TestCounts:
    def test_availability_counts_ignore_the_availability_filter(
        self, client, customer_headers, inventory
    ):
        body = search(client, customer_headers, availability="in_stock", make="ford")

        assert body["total"] == 1
        assert body["counts"] == {"all": 2, "in_stock": 1, "out_of_stock": 1}


class TestSortingAndPaging:
    def test_sorts_by_price(self, client, customer_headers, inventory):
        asc = search(client, customer_headers, sort="price_asc")
        desc = search(client, customer_headers, sort="price_desc")

        asc_prices = [float(v["price"]) for v in asc["items"]]
        assert asc_prices == sorted(asc_prices)
        assert [v["id"] for v in desc["items"]] == [v["id"] for v in reversed(asc["items"])]

    def test_default_sort_is_newest_first(self, client, customer_headers, inventory):
        body = search(client, customer_headers)

        assert body["items"][0]["id"] == inventory["model3"]["id"]

    def test_paginates_with_limit_and_offset(self, client, customer_headers, inventory):
        first = search(client, customer_headers, sort="price_asc", limit=2, offset=0)
        second = search(client, customer_headers, sort="price_asc", limit=2, offset=2)

        assert first["total"] == second["total"] == 5
        assert len(first["items"]) == len(second["items"]) == 2
        assert ids(first).isdisjoint(ids(second))


class TestValidation:
    @pytest.mark.parametrize(
        ("params", "field"),
        [
            ({"min_price": "-5"}, "min_price"),
            ({"min_price": "500", "max_price": "100"}, "max_price"),
            ({"category": "spaceship"}, "category"),
            ({"availability": "maybe"}, "availability"),
            ({"sort": "random"}, "sort"),
            ({"limit": 0}, "limit"),
            ({"limit": 101}, "limit"),
            ({"offset": -1}, "offset"),
        ],
    )
    def test_rejects_invalid_query(self, client, customer_headers, params, field):
        response = client.get("/api/vehicles/search", params=params, headers=customer_headers)

        assert response.status_code == 422
        assert field in {d["field"] for d in response.json()["error"]["details"]}
